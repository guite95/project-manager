import { Prisma } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { prisma } from '../db.ts';
import { erdDomains, makeErdChart, type ErdSnapshot } from '../erd/chart.ts';
import { ERD_LAYOUT_PREFIX, erdLayoutKey, parseSavedErdLayout } from '../erd/saved-layout.ts';
import { erdHash, erdLayoutViews, generateErdLayouts } from './erd-layout-generator.ts';

function checkedSnapshot(value: unknown): ErdSnapshot {
  const snapshot = value as ErdSnapshot;
  if (!snapshot || !Array.isArray(snapshot.models) || !Array.isArray(snapshot.relations)) throw new Error('TNS ERD 스냅샷이 없습니다.');
  return snapshot;
}

/** 조회는 저장된 좌표만 반환한다. 누락/스냅샷 불일치를 자동 생성으로 숨기지 않는다. */
export async function getTnsErdLayout(snapshot: ErdSnapshot, domain: string, focus?: string) {
  if (!erdDomains.some(d => d.slug === domain) || (focus && !snapshot.models.some(m => m.name === focus))) throw new Error('ERD 보기 식별자가 올바르지 않습니다.');
  const row = await prisma.appSetting.findUnique({where:{key:erdLayoutKey(domain,focus)}});
  if (!row) return null;
  const value = parseSavedErdLayout(row.value,makeErdChart(snapshot,domain,focus));
  if (value.snapshotHash !== erdHash(snapshot)) return null;
  return value;
}

async function readState(tx: Prisma.TransactionClient) {
  const snapshotRow = await tx.appSetting.findUnique({where:{key:'erd:tns'}});
  const snapshot = checkedSnapshot(snapshotRow?.value);
  const layouts = await tx.appSetting.findMany({where:{key:{startsWith:ERD_LAYOUT_PREFIX}},orderBy:{key:'asc'}});
  const documents = await tx.$queryRaw<{slug:string;revision:number;document:Prisma.JsonValue}[]>(Prisma.sql`
    SELECT slug, revision, document FROM flow_document WHERE project_slug = 'tns' AND document ? 'erdDomain' ORDER BY slug
  `);
  return {snapshot,layouts,documents};
}
function describe(state: Awaited<ReturnType<typeof readState>>) {
  const views = erdLayoutViews(state.snapshot);
  const keys = new Set(state.layouts.map(row => row.key));
  return {
    token:erdHash(state),snapshotHash:erdHash(state.snapshot),tables:state.snapshot.models.length,relations:state.snapshot.relations.length,
    domainViews:erdDomains.length,focusViews:state.snapshot.models.length,existing:state.layouts.length,
    missing:views.filter(view => !keys.has(erdLayoutKey(view.domain,view.focus))).length,
  };
}
export async function inspectTnsErdLayouts() {
  return prisma.$transaction(async tx => describe(await readState(tx)),{isolationLevel:'RepeatableRead'});
}

/** 읽기 전용 검사 토큰과 검증된 백업을 확보한 뒤 누락된 배치만 생성한다. */
export async function initializeTnsErdLayouts(expectedToken: string, backupDirectory: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedToken)) throw new Error('검사 토큰이 필요합니다.');
  const before = await prisma.$transaction(tx => readState(tx),{isolationLevel:'RepeatableRead'});
  if (erdHash(before) !== expectedToken) throw new Error('스냅샷 또는 저장된 배치가 변경되었습니다. 다시 검사하세요.');
  const generated = generateErdLayouts(before.snapshot);
  const current = new Map(before.layouts.map(row => [row.key,row.value]));
  for (const view of erdLayoutViews(before.snapshot)) {
    const previous = current.get(erdLayoutKey(view.domain,view.focus));
    if (!previous) continue;
    const parsed = parseSavedErdLayout(previous,makeErdChart(before.snapshot,view.domain,view.focus));
    if (parsed.snapshotHash !== erdHash(before.snapshot)) throw new Error('기존 배치와 스냅샷이 다릅니다. 기존 값을 자동 교체하지 않습니다.');
  }
  if (before.layouts.some(row => !generated.has(row.key))) throw new Error('알 수 없는 기존 배치 키가 있습니다. 먼저 확인하세요.');
  const missing = [...generated].filter(([key]) => !current.has(key));
  if (!missing.length) return {created:0,preserved:current.size,backup:null,backupSha256:null};
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT key FROM app_setting WHERE key = 'erd:tns' FOR UPDATE`);
    const locked = await readState(tx);
    if (erdHash(locked) !== expectedToken) throw new Error('스냅샷 또는 저장된 배치가 변경되었습니다. 다시 검사하세요.');
    const raw = JSON.stringify({version:1,backedUpAt:new Date().toISOString(),state:locked,createdKeys:missing.map(([key]) => key)});
    await mkdir(backupDirectory,{recursive:true,mode:0o700});
    const backup = join(backupDirectory,`before-tns-erd-layouts-${Date.now()}-${randomUUID()}.json`);
    await writeFile(backup,raw,{flag:'wx',mode:0o600});
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const backupSha256 = hash(raw);
    if (hash(await readFile(backup,'utf8')) !== backupSha256) throw new Error('백업 검증에 실패했습니다.');
    for (const [key,value] of missing) await tx.appSetting.create({data:{key,value:JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue}});
    const after = await readState(tx);
    if (!isDeepStrictEqual(after.snapshot,before.snapshot) || !isDeepStrictEqual(after.documents,before.documents)) throw new Error('ERD 원본 보존 검사에 실패했습니다.');
    if (after.layouts.length !== before.layouts.length+missing.length) throw new Error('저장 개수가 일치하지 않습니다.');
    const saved = new Map(after.layouts.map(row => [row.key,row.value]));
    for (const [key,value] of [...current,...missing]) if (!isDeepStrictEqual(saved.get(key),value)) throw new Error('저장 값 검증에 실패했습니다.');
    return {created:missing.length,preserved:current.size,backup,backupSha256};
  },{isolationLevel:'Serializable',timeout:30000});
}

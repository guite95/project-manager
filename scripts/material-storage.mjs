#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { sha256, storageConfig } from '../lib/server/object-storage.mjs';
import { storeMaterial, restoreMaterial, compactMaterial, encodeMaterial } from '../lib/server/material-storage.mjs';
import { validateProjectContent } from '../lib/flows/content.ts';

const [mode, ...args] = process.argv.slice(2);
const arg = name => args[args.indexOf(name) + 1];
const backup = args.includes('--backup') ? resolve(arg('--backup')) : null;
const canonical = value => JSON.stringify(value, function (_key, v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v;
});
const sql = `SELECT project_slug,slug,revision,document FROM flow_document
  WHERE document->'content'->>'kind' IN ('material','html','slides') ORDER BY project_slug,slug`;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  if (!['inspect','prepare','copy','compact','verify'].includes(mode)) throw new Error('inspect|prepare|copy|compact|verify 명령이 필요합니다.');
  await db.connect();
  const rows = (await db.query(sql)).rows;
  if (mode === 'inspect') {
    console.log(JSON.stringify({ count: rows.length, kinds: rows.map(r => r.document.content.kind), stored: rows.filter(r => r.document.content.storage).length }));
  } else if (mode === 'prepare') {
    if (!backup) throw new Error('--backup 절대 경로가 필요합니다.');
    const bytes = Buffer.from(JSON.stringify({ version: 1, rows }));
    await mkdir(dirname(backup), { recursive: true, mode: 0o700 });
    await writeFile(backup, bytes, { flag: 'wx', mode: 0o600 });
    const verified = await readFile(backup);
    if (sha256(verified) !== sha256(bytes) || !isDeepStrictEqual(JSON.parse(verified).rows, rows)) throw new Error('백업 검증 실패');
    console.log(JSON.stringify({ backup, sha256: sha256(bytes), count: rows.length }));
  } else if (mode === 'verify') {
    let bytes = 0;
    for (const r of rows) {
      if (!r.document.content.storage) throw new Error('OCI 참조가 없는 자료가 있습니다.');
      const restored = await restoreMaterial(r.document, r.project_slug, r.slug);
      validateProjectContent(restored.content);
      bytes += encodeMaterial(restored.content).bytes.length;
      const { storage, ...original } = r.document.content;
      if ('data' in original || 'html' in original || 'slides' in original) {
        if (!isDeepStrictEqual(original, restored.content)) throw new Error('원본 비교 실패');
      }
    }
    console.log(JSON.stringify({ verified: rows.length, bytes, legacyBodies: rows.filter(r => ['data','html','slides'].some(k => k in r.document.content)).length }));
  } else {
    if (!backup || !args.includes('--sha256') || !storageConfig()) throw new Error('검증된 백업, --sha256 및 OCI 설정이 필요합니다.');
    const bytes = await readFile(backup);
    if (sha256(bytes) !== arg('--sha256')) throw new Error('백업 해시 불일치');
    const saved = JSON.parse(bytes);
    if (saved.version !== 1 || canonical(rows) !== canonical(saved.rows)) throw new Error('백업 이후 자료가 변경되었습니다. 다시 prepare 하세요.');
    if (mode === 'compact' && !args.includes('--compatible-app-deployed')) throw new Error('OCI 호환 앱 배포 확인 후 --compatible-app-deployed를 지정하세요.');
    const converted = [];
    for (const r of rows) {
      const restored = await restoreMaterial(r.document, r.project_slug, r.slug);
      validateProjectContent(restored.content);
      if (r.document.content.storage) {
        const { storage, ...original } = r.document.content;
        if (['data','html','slides'].some(k => k in original) && !isDeepStrictEqual(original, restored.content)) throw new Error('복사 이후 원본이 변경되었습니다. 수동 대조가 필요합니다.');
      }
      const stored = r.document.content.storage
        ? compactMaterial(restored.content, r.document.content.storage)
        : await storeMaterial(restored.content, r.project_slug, r.slug);
      converted.push({ ...r, document: { ...r.document, content: mode === 'copy' ? { ...restored.content, storage: stored.storage } : stored } });
    }
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='5s'");
    // 행 잠금만으로는 새 자료 삽입을 막지 못하므로 짧은 전환 트랜잭션에서 쓰기를 직렬화한다.
    await db.query('LOCK TABLE flow_document IN SHARE ROW EXCLUSIVE MODE');
    const locked = (await db.query(`${sql} FOR UPDATE`)).rows;
    if (canonical(locked) !== canonical(saved.rows)) throw new Error('업로드 중 자료가 변경되어 DB 전환을 중단합니다.');
    let changed = 0;
    for (const r of converted) {
      if (canonical(r.document) === canonical(rows.find(x => x.project_slug === r.project_slug && x.slug === r.slug).document)) continue;
      const update = await db.query('UPDATE flow_document SET document=$1::jsonb,revision=revision+1,updated_at=NOW() WHERE project_slug=$2 AND slug=$3 AND revision=$4', [JSON.stringify(r.document), r.project_slug, r.slug, r.revision]);
      if (update.rowCount !== 1) throw new Error('자료 revision 충돌');
      changed++;
    }
    await db.query('COMMIT');
    console.log(JSON.stringify({ mode, changed, verifiedObjects: converted.length, dbBodiesRetained: mode === 'copy' }));
  }
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  // SDK/DB 오류 객체는 인증정보나 본문을 포함할 수 있으므로 출력하지 않는다.
  console.error(`자료 저장소 작업 실패 (${mode}). 설정·백업·revision 및 객체 무결성을 확인하세요.`);
  process.exitCode = 1;
} finally { await db.end(); }

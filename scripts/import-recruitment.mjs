#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/db.ts';
import { parseRecruitmentDocument, recruitmentKey } from '../lib/recruitment.ts';

const [command, inputPath, expectedHash, backupPath] = process.argv.slice(2);
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  if (!['inspect', 'apply'].includes(command) || !inputPath) throw new Error('사용법: import-recruitment.mjs inspect <json> | apply <json> <sha256> <backup.json>');
  const bytes = await readFile(inputPath);
  const sha256 = hash(bytes);
  const input = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(input) || !input.length || input.length > 500) throw new Error('1~500개 문서 배열이 필요합니다.');
  const docs = input.map(row => ({ ...parseRecruitmentDocument(row), id: row.id }));
  const keys = docs.map(doc => recruitmentKey(doc.id));
  if (new Set(keys).size !== keys.length) throw new Error('문서 ID가 중복됩니다.');
  const before = await prisma.appSetting.findMany({ where: { key: { in: keys } }, orderBy: { key: 'asc' } });
  const existing = new Map(before.map(row => [row.key, row.value]));
  const conflicting = docs.filter(doc => {
    const prior = existing.get(recruitmentKey(doc.id));
    return prior && JSON.stringify(parseRecruitmentDocument(prior)) !== JSON.stringify(parseRecruitmentDocument(doc));
  });
  console.log(JSON.stringify({ command, sha256, documents: docs.length, existing: before.length, new: docs.length - before.length, conflicting: conflicting.map(doc => doc.id) }));
  if (command === 'apply') {
    if (expectedHash !== sha256 || !backupPath) throw new Error('inspect에서 확인한 SHA-256과 백업 경로가 필요합니다.');
    if (conflicting.length) throw new Error('기존에 편집한 자료가 있습니다. 덮어쓰지 않습니다.');
    const target = resolve(backupPath);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const backup = JSON.stringify({ createdAt: new Date().toISOString(), keys, rows: before }, null, 2);
    await writeFile(target, backup, { mode: 0o600, flag: 'wx' });
    if (hash(await readFile(target)) !== hash(backup)) throw new Error('백업 검증에 실패했습니다.');
    await prisma.$transaction(async tx => {
      const current = await tx.appSetting.findMany({ where: { key: { in: keys } }, orderBy: { key: 'asc' } });
      if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error('검토 후 대상 자료가 변경되었습니다. 다시 확인하세요.');
      for (const doc of docs) {
        const key = recruitmentKey(doc.id);
        if (!existing.has(key)) await tx.appSetting.create({ data: { key, value: { ...doc, revision: 1, updatedAt: new Date().toISOString() } } });
      }
    }, { isolationLevel: 'Serializable', timeout: 30_000 });
    const after = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
    const actual = new Map(after.map(row => [row.key, row.value]));
    if (after.length !== docs.length || docs.some(doc => JSON.stringify(parseRecruitmentDocument(actual.get(recruitmentKey(doc.id)))) !== JSON.stringify(parseRecruitmentDocument(doc)))) throw new Error('저장 후 내용 대조에 실패했습니다.');
    console.log(JSON.stringify({ verified: after.length, backup: target, backupSha256: hash(backup) }));
  }
} catch (error) {
  // DB 연결 정보가 오류에 포함될 수 있으므로 드라이버 오류를 출력하지 않는다.
  console.error(error?.name === 'Error' || error?.name === 'RecruitmentError' ? error.message : '자료 처리에 실패했습니다. DB 연결과 대상 자료를 확인하세요.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }

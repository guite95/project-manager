#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/db.ts';
import { parseRecruitmentDocument, recruitmentKey } from '../lib/recruitment.ts';
import { credentialsKey, parseRecruitmentCredentials } from '../lib/recruitment-credentials.ts';

const [command, inputPath, expectedHash, backupPath] = process.argv.slice(2);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  if (!['inspect', 'apply'].includes(command) || !inputPath) throw new Error('inspect <json> | apply <json> <sha256> <backup.json>');
  const bytes = await readFile(inputPath);
  const sha256 = hash(bytes);
  const input = JSON.parse(bytes.toString('utf8'));
  const key = recruitmentKey(input.documentId);
  const items = parseRecruitmentCredentials(input.items);
  const keys = [key, credentialsKey];
  const before = await prisma.appSetting.findMany({ where: { key: { in: keys } }, orderBy: { key: 'asc' } });
  if (before.some(row => row.key === credentialsKey)) throw new Error('이미 지원용 정보가 있습니다. 덮어쓰지 않습니다.');
  const original = before.find(row => row.key === key)?.value;
  if (!original || original.kind !== 'PORTFOLIO' || original.revision !== input.expectedRevision) throw new Error('포트폴리오 종류 또는 수정 버전이 일치하지 않습니다.');
  if (!Array.isArray(input.replacements) || !input.replacements.length) throw new Error('본문에서 분리할 정보가 필요합니다.');
  const document = parseRecruitmentDocument(original);
  for (const patch of input.replacements) {
    const matching = document.sections.filter(section => section.title === patch.sectionTitle);
    if (matching.length !== 1 || typeof patch.from !== 'string' || !patch.from || typeof patch.to !== 'string' || !Number.isSafeInteger(patch.count) || patch.count < 1) throw new Error('본문 변경 대상을 확인하세요.');
    if (matching[0].body.split(patch.from).length - 1 !== patch.count) throw new Error('본문이 검토한 내용과 다릅니다.');
    matching[0].body = matching[0].body.replaceAll(patch.from, patch.to);
  }
  const validated = parseRecruitmentDocument(document);
  console.log(JSON.stringify({ command, sha256, documentRevision: original.revision, items: items.length, replacements: input.replacements.length }));
  if (command === 'apply') {
    if (sha256 !== expectedHash || !backupPath) throw new Error('검토 해시와 백업 경로가 필요합니다.');
    const target = resolve(backupPath);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const backup = JSON.stringify({ createdAt: new Date().toISOString(), keys, rows: before }, null, 2);
    await writeFile(target, backup, { flag: 'wx', mode: 0o600 });
    if (hash(await readFile(target)) !== hash(backup)) throw new Error('백업 검증 실패');
    const updatedAt = new Date().toISOString();
    const savedDocument = { ...validated, id: input.documentId, revision: original.revision + 1, updatedAt };
    const savedCredentials = { items, revision: 1, updatedAt };
    await prisma.$transaction(async tx => {
      const current = await tx.appSetting.findMany({ where: { key: { in: keys } }, orderBy: { key: 'asc' } });
      if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error('검토 후 정보가 변경되었습니다.');
      await tx.appSetting.create({ data: { key: credentialsKey, value: savedCredentials } });
      await tx.appSetting.update({ where: { key }, data: { value: savedDocument } });
    }, { isolationLevel: 'Serializable', timeout: 30_000 });
    const after = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
    const actualDocument = after.find(row => row.key === key)?.value;
    const actualCredentials = after.find(row => row.key === credentialsKey)?.value;
    if (JSON.stringify(parseRecruitmentDocument(actualDocument)) !== JSON.stringify(validated) ||
        JSON.stringify(parseRecruitmentCredentials(actualCredentials?.items)) !== JSON.stringify(items) ||
        actualDocument?.revision !== savedDocument.revision || actualCredentials?.revision !== 1) throw new Error('저장 후 내용 대조 실패');
    console.log(JSON.stringify({ verified: items.length, documentRevision: savedDocument.revision, backup: target, backupSha256: hash(backup) }));
  }
} catch (error) {
  console.error(['Error', 'RecruitmentError'].includes(error?.name) ? error.message : '지원용 정보 등록에 실패했습니다. DB 연결과 대상을 확인하세요.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }

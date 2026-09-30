#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/db.ts';
import { parsePublicPortfolio, publicPortfolioKey } from '../lib/public-portfolio.ts';

const [command, inputPath, expectedHash, backupPath] = process.argv.slice(2);
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  if (!['inspect', 'apply'].includes(command) || !inputPath) throw new Error('사용법: import-public-portfolio.mjs inspect <json> | apply <json> <sha256> <backup.json>');
  const bytes = await readFile(inputPath);
  const input = JSON.parse(bytes.toString('utf8'));
  const portfolio = parsePublicPortfolio(input.portfolio);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('expectedRevision이 필요합니다.');
  const before = await prisma.appSetting.findUnique({ where: { key: publicPortfolioKey } });
  if ((before?.value?.revision ?? 0) !== input.expectedRevision) throw new Error('저장된 수정 버전이 입력과 다릅니다. 다시 확인하세요.');
  // 검토 토큰은 입력과 당시 DB 상태를 함께 고정한다.
  const sha256 = hash(JSON.stringify({ inputSha256: hash(bytes), before }));
  console.log(JSON.stringify({ command, sha256, revision: input.expectedRevision, published: portfolio.published, projects: portfolio.content.projects.map(item => item.title) }));
  if (command === 'apply') {
    if (expectedHash !== sha256 || !backupPath) throw new Error('inspect에서 확인한 SHA-256과 백업 경로가 필요합니다.');
    const target = resolve(backupPath);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const backup = JSON.stringify({ createdAt: new Date().toISOString(), key: publicPortfolioKey, row: before }, null, 2);
    await writeFile(target, backup, { mode: 0o600, flag: 'wx' });
    if (hash(await readFile(target)) !== hash(backup)) throw new Error('백업 검증에 실패했습니다.');
    const saved = { ...portfolio, revision: input.expectedRevision + 1, updatedAt: new Date().toISOString() };
    await prisma.$transaction(async tx => {
      const current = await tx.appSetting.findUnique({ where: { key: publicPortfolioKey } });
      if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error('검토 후 대상 자료가 변경되었습니다. 다시 확인하세요.');
      if (before) {
        const result = await tx.appSetting.updateMany({ where: { key: publicPortfolioKey, value: { equals: before.value } }, data: { value: saved } });
        if (result.count !== 1) throw new Error('저장 중 자료가 변경되었습니다.');
      } else await tx.appSetting.create({ data: { key: publicPortfolioKey, value: saved } });
    }, { isolationLevel: 'Serializable', timeout: 30_000 });
    const after = await prisma.appSetting.findUnique({ where: { key: publicPortfolioKey } });
    if (!after || JSON.stringify(parsePublicPortfolio(after.value)) !== JSON.stringify(portfolio) || after.value.revision !== saved.revision) throw new Error('저장 후 내용 대조에 실패했습니다.');
    console.log(JSON.stringify({ verified: true, revision: after.value.revision, backup: target, backupSha256: hash(backup) }));
  }
} catch (error) {
  console.error(['Error', 'RecruitmentError'].includes(error?.name) ? error.message : '자료 처리에 실패했습니다. DB 연결과 대상 자료를 확인하세요.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }

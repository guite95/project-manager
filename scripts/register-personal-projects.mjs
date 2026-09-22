#!/usr/bin/env node
import { parseArgs, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { prisma } from '../lib/db.ts';
import { personalProjects } from './personal-project-seed.mjs';
import { assertTestDatabase } from '../lib/test-database.ts';

class RegistrationError extends Error {}
const oldTitles = { 'personal-flight-app': 'flight-app', 'personal-ilchul': 'ilchul' };
const digest = data => createHash('sha256').update(data).digest('hex');

// 공유 DB에 새 항목을 넣기 전에 운영 앱의 DB 기반 프로젝트 등록 기능을 확인한다.
async function verifyRuntime(slugs) {
  if (process.env.SHARED_DATABASE !== '1' || !slugs.length) return;
  const { SHARED_DB_SSH_HOST: host, SHARED_DB_SSH_USER: user, SHARED_DB_SSH_KEY: key } = process.env;
  if (!host || !user || !key || !/^[a-zA-Z0-9.-]+$/.test(host) || !/^[a-zA-Z0-9_-]+$/.test(user))
    throw new RegistrationError('공유 DB 래퍼의 SSH 설정이 필요합니다.');
  const { stdout } = await promisify(execFile)('ssh', [
    '-i', key.replace(/^~(?=\/)/, homedir()), '-p', process.env.SHARED_DB_SSH_PORT ?? '61185',
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', `${user}@${host}`,
    `docker exec project-management node --experimental-strip-types --input-type=module -e 'import { PROJECT_REGISTRY_VERSION } from "/app/lib/project-registry.ts"; console.log(JSON.stringify(PROJECT_REGISTRY_VERSION))'`,
  ], { timeout: 15000, maxBuffer: 65536 });
  const deployed = JSON.parse(stdout);
  if (deployed !== 1)
    throw new RegistrationError('새 개인 프로젝트를 인식하는 앱을 먼저 배포하세요. 기존 이름만 변경하려면 --existing-only를 사용하세요.');
}

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    'existing-only': { type: 'boolean' }, 'backup-dir': { type: 'string' },
  } });
  const action = positionals[0] ?? 'inspect';
  if (positionals.length > 1 || !['inspect', 'apply'].includes(action)) throw new RegistrationError('inspect 또는 apply를 지정하세요.');
  if (process.env.SHARED_DATABASE !== '1') assertTestDatabase(process.env.DATABASE_URL);
  if (action === 'apply' && !values['backup-dir']) throw new RegistrationError('apply에는 --backup-dir가 필요합니다.');
  const slugs = personalProjects.map(project => project.slug);
  if (action === 'apply' && !values['existing-only']) await verifyRuntime(slugs);
  const result = await prisma.$transaction(async tx => {
    const existing = await tx.flowProject.findMany({ where: { slug: { in: slugs } }, orderBy: { slug: 'asc' } });
    const missing = personalProjects.filter(project => !existing.some(row => row.slug === project.slug));
    const renames = existing.flatMap(row => {
      const desired = personalProjects.find(project => project.slug === row.slug);
      if (row.title === desired.title) return [];
      if (row.title !== oldTitles[row.slug]) throw new RegistrationError(`기존 프로젝트 이름을 확인하세요: ${row.slug}`);
      return [{ slug: row.slug, before: row.title, after: desired.title }];
    });
    const inserts = values['existing-only'] ? [] : missing;
    let backup;
    if (action === 'apply' && (renames.length || inserts.length)) {
      const directory = resolve(values['backup-dir']);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const body = JSON.stringify({ version: 1, existing, inserts: inserts.map(p => p.slug), renames }, null, 2);
      const file = join(directory, `personal-projects-${Date.now()}-${randomUUID()}.json`);
      await writeFile(file, body, { flag: 'wx', mode: 0o600 });
      if (digest(await readFile(file)) !== digest(body)) throw new RegistrationError('백업 검증에 실패했습니다.');
      backup = { file, sha256: digest(body) };
      for (const row of renames) {
        await tx.flowProject.update({ where: { slug: row.slug }, data: { title: row.after } });
      }
      const last = await tx.flowProject.aggregate({ _max: { position: true } });
      await tx.flowProject.createMany({ data: inserts.map((project, index) => ({
        slug: project.slug, title: project.title, scope: 'PERSONAL', personalGroup: project.group.toUpperCase(), position: (last._max.position ?? -1) + index + 1,
      })) });
      await tx.projectRepository.createMany({data:inserts.flatMap(project => project.repositories.map(path => ({workspace:'UK',path,projectSlug:project.slug})))});
    }
    return { action, existing: existing.length, renames, missing: missing.map(project => project.slug),
      inserted: action === 'apply' ? inserts.length : 0, backup };
  }, { isolationLevel: 'Serializable', timeout: 15000 });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof RegistrationError ? error.message : '개인 프로젝트 등록 실패. DB 연결·실행 환경·기존 식별자 충돌을 확인하세요.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }

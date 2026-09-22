import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from './test-db.mjs';
import { personalProjects } from '../../scripts/personal-project-seed.mjs';

const slugs = personalProjects.map(p => p.slug);
const run = async (...args) => JSON.parse((await promisify(execFile)(process.execPath, [
  '--experimental-strip-types', 'scripts/register-personal-projects.mjs', ...args,
], { env: process.env })).stdout);

test('개인 프로젝트 등록은 백업 후 이름만 변경하고 신규 등록·재실행 시 기존 데이터를 보존한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'personal-registration-'));
  let ownsRows = false;
  try {
    assert.equal(await prisma.flowProject.count({ where: { slug: { in: slugs } } }), 0, '기존 테스트 데이터를 덮어쓰지 않는다');
    ownsRows = true;
    await prisma.flowProject.createMany({ data: [
      { slug: 'personal-flight-app', title: 'flight-app', scope:'PERSONAL', personalGroup:'PORTFOLIO', showInTasks: false, intro: 'preserve flight intro', position: 100 },
      { slug: 'personal-ilchul', title: 'ilchul', scope:'PERSONAL', personalGroup:'PORTFOLIO', intro: 'preserve ilchul intro', position: 101 },
    ] });
    const inspected = await run('inspect');
    assert.equal(inspected.renames.length, 2);
    assert.equal(inspected.missing.length, 4);
    assert.equal((await prisma.flowProject.findUnique({ where: { slug: 'personal-flight-app' } })).title, 'flight-app');
    await assert.rejects(() => run('apply'));
    const renamed = await run('apply', '--existing-only', '--backup-dir', directory);
    assert.equal(renamed.inserted, 0);
    assert.equal(await prisma.flowProject.count({ where: { slug: { in: slugs } } }), 2);
    const backup = JSON.parse(await readFile(renamed.backup.file, 'utf8'));
    assert.equal(backup.existing.find(p => p.slug === 'personal-flight-app').title, 'flight-app');
    assert.deepEqual(await prisma.flowProject.findUnique({ where: { slug: 'personal-flight-app' } }), {
      slug: 'personal-flight-app', title: '해봉티켓', scope:'PERSONAL',personalGroup:'PORTFOLIO',showInTasks:false,revision:0,intro: 'preserve flight intro', position: 100,
    });
    const applied = await run('apply', '--backup-dir', directory);
    assert.equal(applied.inserted, 4);
    const rows = await prisma.flowProject.findMany({ where: { slug: { in: slugs } }, orderBy: { slug: 'asc' } });
    assert.equal(rows.length, 6);
    const repeated = await run('apply', '--backup-dir', directory);
    assert.equal(repeated.inserted, 0);
    assert.equal(repeated.backup, undefined);
    assert.deepEqual(await prisma.flowProject.findMany({ where: { slug: { in: slugs } }, orderBy: { slug: 'asc' } }), rows);
    assert.equal((await readdir(directory)).length, 2);
    await prisma.flowProject.update({ where: { slug: 'personal-ilchul' }, data: { title: 'unrecognized title' } });
    await assert.rejects(() => run('apply', '--backup-dir', directory));
    assert.equal((await prisma.flowProject.findUnique({ where: { slug: 'personal-ilchul' } })).title, 'unrecognized title');
  } finally {
    if (ownsRows) { await prisma.projectRepository.deleteMany({where:{projectSlug:{in:slugs}}}); await prisma.flowProject.deleteMany({ where: { slug: { in: slugs } } }); }
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});

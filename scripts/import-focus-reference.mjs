import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { prisma } from '../lib/db.ts';
import { parseFlowChart } from '../lib/flows/document.ts';
import { importFlowProject } from '../lib/server/import-flow-project.ts';
import { assertTestDatabase } from '../lib/test-database.ts';

// 공유 DB는 검증된 SSH 래퍼로만, 로컬 검증은 보호된 테스트 DB로만 실행한다.
if (process.env.SHARED_DATABASE !== '1') assertTestDatabase(process.env.DATABASE_URL);
try {
  const file = resolve('data/imports/focus-ai-2026-09-14.json');
  const source = await readFile(file, 'utf8');
  const project = JSON.parse(source);
  if (project.slug !== 'focus-ai') throw new Error('포커스에이아이 자료만 가져올 수 있습니다.');
  const charts = project.categories.flatMap(c => c.charts);
  charts.forEach(parseFlowChart);
  if (project.categories.length !== 9 || charts.length !== 25) throw new Error('예상한 콘텐츠 수와 다릅니다.');
  const before = await prisma.flowProject.findMany({ orderBy: { slug: 'asc' }, include: {
    categories: { orderBy: { position: 'asc' }, include: { charts: { orderBy: { position: 'asc' } } } },
  } });
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'inspect',
    existingProjects: before.map(p => p.slug), categories: project.categories.length, documents: charts.length,
    sourceSha256: createHash('sha256').update(source).digest('hex') }));
  if (before.some(p => p.slug === project.slug)) throw new Error('이미 있는 프로젝트입니다. 가져오기를 중단합니다.');
  if (process.argv.includes('--apply')) {
    const directory = resolve(homedir(), 'pm-backups');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const backup = resolve(directory, `before-focus-import-${Date.now()}.json`);
    const data = JSON.stringify(before);
    await writeFile(backup, data, { flag: 'wx', mode: 0o600 });
    const hash = createHash('sha256').update(data).digest('hex');
    if (createHash('sha256').update(await readFile(backup)).digest('hex') !== hash) throw new Error('백업 검증 실패');
    console.log(JSON.stringify({ backup, sha256: hash }));
    console.log(JSON.stringify(await importFlowProject(project)));
    const actual = await prisma.flowDocument.findMany({ where: { projectSlug: project.slug } });
    if (actual.length !== charts.length) throw new Error('가져온 문서 수가 일치하지 않습니다.');
    for (const row of actual) {
      const expected = charts.find(c => c.slug === row.slug);
      // JSONB 객체 키 순서는 달라질 수 있으므로 구조로 비교한다.
      const { isDeepStrictEqual } = await import('node:util');
      if (!isDeepStrictEqual(row.document, expected)) throw new Error('가져온 콘텐츠 검증 실패');
    }
    const unchanged = await prisma.flowProject.findMany({ where: { slug: { not: project.slug } }, orderBy: { slug: 'asc' }, include: {
      categories: { orderBy: { position: 'asc' }, include: { charts: { orderBy: { position: 'asc' } } } },
    } });
    const { isDeepStrictEqual } = await import('node:util');
    if (!isDeepStrictEqual(unchanged, before)) throw new Error('기존 프로젝트 변경 여부를 확인하세요.');
    console.log('검증 완료: 전체 콘텐츠 일치 · 기존 프로젝트 보존');
  }
} finally { await prisma.$disconnect(); }

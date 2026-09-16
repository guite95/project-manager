#!/usr/bin/env -S node --experimental-strip-types
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFlowSshConfig } from '../lib/flows/ssh-config.mjs';

const root = resolve(dirname(await realpath(fileURLToPath(import.meta.url))), '..');
const args = process.argv.slice(2);
const [command, target] = args;
const help = `pm-flow — 범용 화면·로직 플로우차트
  list [project]                  프로젝트/카테고리/차트 목록
  pull project/category/chart --out file.json
  new project/category/chart --out file.json [--title 제목]
  validate file.json              오프라인 검증
  diff file.json                  DB 원본과 비교 (쓰기 없음)
  apply file.json                 원문 백업 + revision 조건 저장
  skills                         제공 스킬 목록
  help
새 문서는 revision 0. 기존 문서는 pull의 revision을 유지합니다.
layout 생략은 사용자 배치 보존, layout: {nodes:{},edges:{}}는 초기화입니다.
DB 명령은 ~/.config/pm-flow/ssh.env의 개인 SSH 설정을 사용합니다.
설정 파일이 없으면 개발 저장소의 .env로 호환됩니다.`;
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined;
const print = value => console.log(JSON.stringify(value, null, 2));
async function output(value) {
  if (out) await writeFile(resolve(out), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  else print(value);
}
try {
  if (!command || command === 'help' || command === '--help') { console.log(help); process.exit(0); }
  if (command === 'skills') {
    print([{ name: 'pm-flow-author', path: resolve(root, 'skills/pm-flow-author/SKILL.md') }, { name: 'pm-flow-review', path: resolve(root, 'skills/pm-flow-review/SKILL.md') }]); process.exit(0);
  }
  if (!['list','pull','new','validate','diff','apply'].includes(command)) throw new Error('알 수 없는 명령입니다. pm-flow help를 확인하세요.');
  if (command !== 'list' && !target) throw new Error('대상 경로나 JSON 파일이 필요합니다.');
  const allowed = command === 'new' ? ['--out','--title'] : command === 'pull' ? ['--out'] : [];
  for (let i = 2; i < args.length; i += 2) if (!allowed.includes(args[i]) || !args[i + 1]) throw new Error('알 수 없거나 값이 없는 옵션입니다.');
  if (['list','pull','diff','apply'].includes(command) && process.env.PM_FLOW_CHILD !== '1') {
    // 사용자가 점유한 터널은 건드리지 않고 임시 포트를 선택한다.
    const server = createServer();
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const port = server.address().port; await new Promise(yes => server.close(yes));
    const sshConfig = await readFlowSshConfig();
    const normalized = [...args];
    if (['diff','apply'].includes(command)) normalized[1] = resolve(target);
    if (out) normalized[normalized.indexOf('--out') + 1] = resolve(out);
    const child = spawn(process.execPath, ['--experimental-strip-types', resolve(root, 'scripts/with-shared-db.mjs'), '--', process.execPath, '--experimental-strip-types', resolve(root, 'scripts/pm-flow.mjs'), ...normalized], {
      cwd: root, stdio: 'inherit', env: { ...process.env, ...sshConfig, PM_FLOW_CHILD: '1', SHARED_DB_LOCAL_PORT: String(port) },
    });
    for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', () => { console.error('CLI 실행 실패'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } else {
    const { parseFlowEnvelope, flowDiff } = await import('../lib/flows/cli-document.ts');
    if (command === 'new') {
      const parts = target.split('/'); if (parts.length !== 3) throw new Error('project/category/chart 형식이 필요합니다.');
      const [projectSlug, categorySlug, slug] = parts;
      const value = parseFlowEnvelope({ projectSlug, categorySlug, revision: 0, chart: { slug, title: args.includes('--title') ? args[args.indexOf('--title') + 1] : slug, nodes: [
        { id: 'start', data: { role: 'screen', screen: '요청 등록', label: '요청 작성', kind: 'core', sections: [{ title: '기능', lines: ['필수 정보를 입력하고 제출한다.'] }, { title: '확인 사항', lines: ['필수 입력값을 확인한다.'] }] } },
        { id: 'process', data: { role: 'logic', label: '요청 검증', kind: 'core', sections: [{ title: '처리', lines: ['입력값 검증 후 저장한다.'] }, { title: '확인 사항', lines: ['검증 실패 시 오류를 반환한다.'] }] } },
      ], edges: [{ id: 'submit', source: 'start', target: 'process', kind: 'future', label: '제출 → 필수값 검증' }] } });
      await output(value);
    } else if (command === 'validate') {
      const row = parseFlowEnvelope(JSON.parse(await readFile(resolve(target), 'utf8')));
      print({ valid: true, nodes: row.chart.nodes.length, edges: row.chart.edges.length });
    } else {
      if (process.env.SHARED_DATABASE !== '1') throw new Error('공유 DB 연결 래퍼를 사용하세요.');
      const { prisma } = await import('../lib/db.ts');
      try {
        if (command === 'list') {
          const rows = await prisma.$queryRaw`SELECT p.slug AS project, p.title AS project_title, c.slug AS category, c.title AS category_title, d.slug AS chart, d.document->>'title' AS title, d.revision FROM flow_project p LEFT JOIN flow_category c ON c.project_slug=p.slug LEFT JOIN flow_document d ON d.project_slug=c.project_slug AND d.category_slug=c.slug WHERE (${target ?? null}::text IS NULL OR p.slug=${target ?? null}) ORDER BY p.position,c.position,d.position`;
          print(rows);
        } else if (command === 'pull') {
          const parts = target.split('/'); if (parts.length !== 3) throw new Error('project/category/chart 형식이 필요합니다.');
          const { getFlowDocument } = await import('../lib/server/flows-store.ts');
          const row = await getFlowDocument(parts[0], parts[2]);
          if (!row || row.categorySlug !== parts[1]) throw new Error('차트를 찾을 수 없습니다.');
          await output(parseFlowEnvelope(row));
        } else {
          const row = parseFlowEnvelope(JSON.parse(await readFile(resolve(target), 'utf8')));
          if (command === 'diff') {
            const { getFlowDocument } = await import('../lib/server/flows-store.ts');
            const { preserveFlowLayout } = await import('../lib/flows/layout.ts');
            const current = await getFlowDocument(row.projectSlug, row.chart.slug);
            print({ expectedRevision: row.revision, currentRevision: current?.revision ?? 0, changes: flowDiff(current?.chart ?? null, current ? preserveFlowLayout(current.chart, row.chart) : row.chart) });
          } else {
            const { applyFlowEnvelope } = await import('../lib/server/flow-cli-store.ts');
            const saved = await applyFlowEnvelope(row);
            print({ ...saved, chart: undefined });
          }
        }
      } finally { await prisma.$disconnect(); }
    }
  }
} catch (error) {
  // 연결 자격증명이 포함될 수 있는 DB 오류 객체는 출력하지 않는다.
  console.error(error.name === 'FlowDocumentError' || error.constructor === Error && !error.code ? error.message : '처리 실패: 입력 JSON, 파일 경로, DB 연결 상태를 확인하세요.');
  process.exitCode = 1;
}

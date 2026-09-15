#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { MeetingDraftError, parseMeetingDraft, prepareMeetingDraft, sha256 } from '../../../lib/meeting-draft.ts';
import { assertTestDatabase } from '../../../lib/test-database.ts';

const help = `회의록 도구 (Node 22.18 이상, 저장소 의존성 필요)
prepare --project SLUG --slug SLUG --title TITLE --date YYYY-MM-DD --notes FILE --transcript FILE --output FILE
  DB 연결 없이 notes와 UTF-8 전사본을 검증·조립합니다. 기존 출력 파일은 덮어쓰지 않습니다.
validate --file FILE
  DB 연결 없이 문서와 원문 해시를 검사하고 초안 파일의 SHA-256을 출력합니다.
projects
  연결된 DB의 프로젝트 이름과 slug를 읽습니다.
inspect --file FILE
  등록 전 프로젝트·중복 여부를 읽기 전용으로 검사합니다.
apply --file FILE --sha256 HASH [--backup-dir DIRECTORY]
  지정한 해시의 초안만 백업 후 신규 등록합니다. 기존 회의록은 갱신하지 않습니다.
DB 명령은 기존 pnpm db:shared 래퍼 또는 로컬 project_management_test DB에서만 허용합니다.`;
let db;
try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: Object.fromEntries(
    ['project', 'slug', 'title', 'date', 'notes', 'transcript', 'output', 'file', 'sha256', 'backup-dir'].map(name => [name, { type: 'string' }]).concat([['help', { type: 'boolean' }]])
  ) });
  if (values.help) { console.log(help); }
  else {
    const command = positionals[0];
    if (positionals.length !== 1 || !['prepare', 'validate', 'projects', 'inspect', 'apply'].includes(command)) throw new MeetingDraftError(help);
    const required = key => { if (!values[key]) throw new MeetingDraftError(`--${key}가 필요합니다.`); return values[key]; };
    const json = async path => JSON.parse(await readFile(path, 'utf8'));
    if (command === 'prepare') {
      const raw = await readFile(required('transcript'));
      const transcript = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
      const draft = prepareMeetingDraft({ projectSlug: required('project'), slug: required('slug'), title: required('title'), date: required('date'), notes: await json(required('notes')), transcript });
      const output = resolve(required('output'));
      const serialized = JSON.stringify(draft, null, 2) + '\n';
      await writeFile(output, serialized, { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ status: 'prepared', output, sha256: sha256(serialized), transcriptSha256: draft.transcriptSha256 }));
    } else if (command === 'validate') {
      const raw = await readFile(required('file'));
      const draft = parseMeetingDraft(JSON.parse(raw.toString('utf8')));
      console.log(JSON.stringify({ status: 'valid', projectSlug: draft.projectSlug, slug: draft.chart.slug, sha256: sha256(raw) }));
    } else {
      // URL 값은 출력하지 않는다. 기존 SSH 래퍼가 공유 DB 이름과 역할을 검증한다.
      if (process.env.SHARED_DATABASE !== '1') assertTestDatabase(process.env.DATABASE_URL);
      const { prisma } = await import('../../../lib/db.ts'); db = prisma;
      if (command === 'projects') {
        console.log(JSON.stringify(await db.flowProject.findMany({ select: { slug: true, title: true }, orderBy: { position: 'asc' } })));
      } else {
        const raw = await readFile(required('file'));
        const draft = parseMeetingDraft(JSON.parse(raw.toString('utf8')));
        const hash = sha256(raw);
        const { inspectMeetingImport, importMeeting } = await import('../../../lib/server/meeting-import-store.ts');
        if (command === 'inspect') {
          console.log(JSON.stringify({ mode: 'inspect', sha256: hash, ...await inspectMeetingImport(draft) }));
        } else {
          if (required('sha256') !== hash) throw new MeetingDraftError('검토한 초안 파일의 해시가 다릅니다. 다시 검사하세요.');
          console.log(JSON.stringify(await importMeeting(draft, resolve(values['backup-dir'] ?? resolve(homedir(), 'pm-backups')))));
        }
      }
    }
  }
} catch (error) {
  console.error(error instanceof MeetingDraftError ? error.message : '회의록 도구 실행 실패: 인자·입력 형식·출력 파일 중복·DB 연결을 확인하세요.');
  process.exitCode = 1;
} finally { if (db) await db.$disconnect(); }

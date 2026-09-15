import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'meeting-cli-'));
const script = fileURLToPath(new URL('../skills/sync-sum/scripts/meeting.mjs', import.meta.url));
const transcript = '\uFEFF첫 발언\r\n둘째 발언\r\n';
writeFileSync(join(dir, 'transcript.txt'), transcript);
writeFileSync(join(dir, 'notes.json'), JSON.stringify({ participants: [], summary: '', discussions: [], decisions: [], actionItems: [] }));
const run = args => execFileSync(process.execPath, [script, ...args], { cwd: dir, env: { ...process.env, DATABASE_URL: '', SHARED_DATABASE: '' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
after(() => rmSync(dir, { recursive: true, force: true }));

test('저장소 밖에서 원문을 보존한 초안을 만들고 형식 검사한다', () => {
  const args = ['prepare', '--project', 'tns', '--slug', 'sample', '--date', '2026-09-14', '--title', '합성 회의', '--notes', 'notes.json', '--transcript', 'transcript.txt', '--output', 'draft.json'];
  const result = JSON.parse(run(args));
  const draft = JSON.parse(readFileSync(join(dir, 'draft.json'), 'utf8'));
  assert.equal(draft.chart.content.transcript, transcript);
  assert.equal((statSync(join(dir, 'draft.json')).mode & 0o777), 0o600);
  assert.equal(JSON.parse(run(['validate', '--file', 'draft.json'])).sha256, result.sha256);
  assert.throws(() => run(args));
});
test('잘못된 UTF-8, 오타 옵션, 보호되지 않은 DB 명령은 거절한다', () => {
  writeFileSync(join(dir, 'bad.txt'), Buffer.from([0xff]));
  assert.throws(() => run(['prepare', '--project', 'tns', '--slug', 'bad', '--date', '2026-09-14', '--title', '검증', '--notes', 'notes.json', '--transcript', 'bad.txt', '--output', 'bad.json']));
  assert.throws(() => run(['prepare', '--unknown', 'value']));
  assert.throws(() => run(['projects']));
  assert.throws(() => run(['apply', '--file', 'draft.json', '--sha256', 'invalid']));
});

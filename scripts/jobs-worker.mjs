import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseConfig, CollectionError, errorCode } from '../lib/job-collector/config.mjs';
import { nextScheduledAt, SCHEDULE_TIME_ZONE } from '../lib/job-collector/schedule.mjs';
import { createCollectionStore } from '../lib/job-collector/store.mjs';
import { runCollection, watchCollections } from '../lib/job-collector/worker.mjs';

const help = `채용 공고 수집 워커
  pnpm jobs:worker inspect --config <설정.json>       설정·다음 실행 시각 확인 (DB/네트워크 접근 없음)
  pnpm jobs:worker collect --config <설정.json>       수집 미리보기 (DB 쓰기 없음)
  pnpm jobs:worker collect --config <설정.json> --apply  즉시 수집·저장
  pnpm jobs:worker watch --config <설정.json> --apply    매일 20:00 예약 및 웹의 수동 요청 처리
  pnpm jobs:worker status                            최근 수집·수동 요청·워커 연결 상태 (DB 읽기)
  pnpm jobs:worker list [--limit 50]                  공고 요약 (DB 읽기)

공유 DB 실행은 pnpm db:shared -- pnpm jobs:worker ... 형식을 사용합니다.
운영 서버 등록·활성화는 이 명령으로 자동 수행하지 않습니다.`;

export function parseArguments(args) {
  if (!args.length || args.includes('--help')) return { command: 'help' };
  const [command, ...rest] = args;
  if (!['inspect', 'collect', 'watch', 'status', 'list'].includes(command)) throw new CollectionError('INVALID_ARGUMENT');
  const options = { command, apply: false, limit: 50 };
  const seen = new Set();
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (seen.has(flag)) throw new CollectionError('INVALID_ARGUMENT');
    seen.add(flag);
    if (flag === '--apply' && ['collect', 'watch'].includes(command)) options.apply = true;
    else if (flag === '--config' && ['inspect', 'collect', 'watch'].includes(command)) {
      const path = rest[++index];
      if (!path || path.startsWith('--')) throw new CollectionError('INVALID_ARGUMENT');
      options.config = path;
    } else if (flag === '--limit' && command === 'list') {
      const value = rest[++index];
      if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 500) throw new CollectionError('INVALID_ARGUMENT');
      options.limit = Number(value);
    } else throw new CollectionError('INVALID_ARGUMENT');
  }
  if (['inspect', 'collect', 'watch'].includes(command) && !options.config) throw new CollectionError('CONFIG_REQUIRED');
  if (command === 'watch' && !options.apply) throw new CollectionError('APPLY_REQUIRED');
  return options;
}

async function main() {
  let store;
  const controller = new AbortController();
  for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => controller.abort());
  const emit = result => console.log(JSON.stringify(result, null, 2));
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.command === 'help') { console.log(help); return; }
    const config = options.config ? parseConfig(JSON.parse(await readFile(options.config, 'utf8'))) : null;
    if (options.command === 'inspect') {
      emit({ schedule: { timeZone: SCHEDULE_TIME_ZONE, time: '20:00', nextAt: nextScheduledAt() }, config });
      return;
    }
    if (options.apply || ['status', 'list'].includes(options.command)) store = createCollectionStore();
    if (options.command === 'status') emit({ sources: await store.status(), ...await store.controlStatus() });
    else if (options.command === 'list') emit(await store.list(options.limit));
    else if (options.command === 'watch') await watchCollections(config, { store, signal: controller.signal, emit });
    else {
      const result = await runCollection(config, { store, signal: controller.signal });
      emit(result);
      if (result.reports.some(report => report.state === 'FAILED' || report.errorCount > 0)) process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({ error: controller.signal.aborted ? 'ABORTED' : errorCode(error) }));
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    if (store) await store.close().catch(() => { console.error(JSON.stringify({ error: 'DATABASE_CLOSE_FAILED' })); process.exitCode = 1; });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

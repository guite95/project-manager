import { runRecordingWorker } from '../lib/server/recording-worker.ts';
import { prisma } from '../lib/db.ts';
const controller = new AbortController();
for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => controller.abort());
try { await runRecordingWorker(controller.signal, process.argv.includes('--once')); }
catch { console.error('녹음 전사 작업자를 시작하거나 실행하지 못했습니다. DB·OCI·Google Speech 설정을 확인하세요.'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }

import { Prisma, type ProjectRecording } from '@prisma/client';
import { prisma } from '../db.ts';
import { readObject } from './object-storage.mjs';
import { ChirpTranscription, parseRecognition } from './chirp-transcription.mjs';
import { normalizeRecordingAudio } from './recording-audio.mjs';
import { claimRecording, renewRecording, completeRecording } from './recordings-store.ts';

export async function cleanupRecordingStages(provider: ChirpTranscription) {
  const rows = await prisma.projectRecording.findMany({ where: { status: 'DONE', staging: { not: Prisma.DbNull } }, take: 20 });
  for (const row of rows) {
    try {
      await provider.remove(row.staging);
      await prisma.projectRecording.updateMany({ where: { id: row.id, status: 'DONE' }, data: { staging: Prisma.DbNull } });
    } catch { /* 완료 원본·전사본은 유지하고 다음 실행에서 임시 사본 정리를 재시도한다. */ }
  }
}
export async function processRecording(row: ProjectRecording, provider: ChirpTranscription, signal: AbortSignal,
  read = readObject, pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms)), normalize = normalizeRecordingAudio) {
  const token = row.leaseToken!;
  const owned = { id: row.id, status: 'PROCESSING', leaseToken: token };
  let operation = row.operation;
  let submitted = operation === 'SUBMITTING';
  let terminalFailure = false;
  try {
    if (submitted) throw new Error('SUBMISSION_UNKNOWN');
    let stage = row.staging as ReturnType<ChirpTranscription['staging']> | null;
    if (!operation) {
      const bytes = await read(row.storage, row.projectSlug, row.id, 'recordings');
      const normalized = await normalize(bytes);
      stage = provider.staging(row);
      // 업로드 직후 죽어도 동일 경로를 재사용한다. 저장소 참조는 서버만 만든다.
      if (!(await prisma.projectRecording.updateMany({ where: owned, data: { staging: stage as Prisma.InputJsonValue } })).count) return;
      await provider.upload(stage, normalized, 'audio/flac');
      if (signal.aborted || !await renewRecording(row.id, token)) return;
      if (!(await prisma.projectRecording.updateMany({ where: owned, data: { operation: 'SUBMITTING' } })).count) return;
      submitted = true;
      operation = await provider.start(stage);
      if (!(await prisma.projectRecording.updateMany({ where: owned, data: { operation } })).count) return;
      submitted = false;
    }
    if (!stage) throw new Error('SPEECH_STAGING_REFERENCE');
    while (!signal.aborted) {
      if (!await renewRecording(row.id, token)) return;
      const response = await provider.poll(operation!);
      terminalFailure = Boolean(response.done);
      const result = parseRecognition(response, stage.uri);
      if (result) {
        terminalFailure = false; // DB 저장 실패에서도 이미 완료된 Google operation을 재사용한다.
        await completeRecording(row.id, token, result); return;
      }
      await pause(10_000);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = Number((error as { response?: { status?: number } }).response?.status);
    const ambiguous = submitted && (!status || status >= 500 || status === 408);
    const retryable = !terminalFailure && !ambiguous && (status === 429 || status >= 500 || code === 'ECONNRESET' || code === 'ETIMEDOUT');
    const message = ambiguous || code === 'SUBMISSION_UNKNOWN'
      ? '전사 요청의 접수 여부를 확인하지 못했습니다. 재시도하면 중복 과금될 수 있어 관리자의 작업 확인이 필요합니다.'
      : code === 'SPEECH_EMPTY_RESULT' ? '인식된 발화가 없습니다. 녹음 파일을 확인한 뒤 재시도해 주세요.'
      : `전사를 완료하지 못했습니다${Number.isInteger(status) && status > 0 ? ` (HTTP ${status})` : ''}. 파일 형식과 Google 전사 설정·권한을 확인해 주세요.`;
    await prisma.projectRecording.updateMany({ where: owned, data: {
      status: retryable ? 'PENDING' : 'FAILED', leaseToken: null, leaseUntil: null, error: message,
      // 접수된 작업 번호는 네트워크 장애에서도 보존한다.
      ...(terminalFailure || submitted && status >= 400 && status < 500 && status !== 408 ? { operation: null } : {}),
    } });
  } finally {
    // 정상 종료·신호 중단에서는 알려진 operation을 유지한 채 다음 작업자에게 넘긴다.
    await prisma.projectRecording.updateMany({ where: owned, data: { status: 'PENDING', leaseToken: null, leaseUntil: null } });
  }
}
export async function runRecordingWorker(signal: AbortSignal, once = false) {
  const provider = new ChirpTranscription();
  do {
    await cleanupRecordingStages(provider);
    const row = await claimRecording();
    if (row) await processRecording(row, provider, signal);
    if (!once && !signal.aborted) await new Promise(resolve => setTimeout(resolve, 15_000));
  } while (!once && !signal.aborted);
  await cleanupRecordingStages(provider);
}

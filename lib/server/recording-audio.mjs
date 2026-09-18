import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_NORMALIZED_BYTES = 128 * 1024 * 1024;

function ffmpegEnvironment() {
  const environment = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ']) {
    if (typeof process.env[key] === 'string') environment[key] = process.env[key];
  }
  return environment;
}

export async function normalizeRecordingAudio(input, { executable = process.env.FFMPEG_BIN || 'ffmpeg', timeoutMs = 10 * 60_000 } = {}) {
  const bytes = Buffer.from(input);
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('올바른 녹음 파일이 아닙니다.');
  const root = await mkdtemp(join(tmpdir(), 'pm-recording-'));
  const inputPath = join(root, 'source-audio');
  const outputPath = join(root, 'diarization.flac');
  try {
    await writeFile(inputPath, bytes, { mode: 0o600 });
    await execute(executable, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
      '-map_metadata', '-1', '-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000',
      '-c:a', 'flac', '-compression_level', '5', '-y', outputPath,
    ], { timeout: timeoutMs, maxBuffer: 1024 * 1024, env: ffmpegEnvironment() });
    const output = await stat(outputPath);
    if (!output.isFile() || output.size < 4 || output.size > MAX_NORMALIZED_BYTES) throw new Error('NORMALIZED_AUDIO_SIZE');
    const normalized = await readFile(outputPath);
    if (normalized.subarray(0, 4).toString('ascii') !== 'fLaC') throw new Error('NORMALIZED_AUDIO_FORMAT');
    return normalized;
  } catch {
    throw new Error('화자 구분용 오디오로 변환하지 못했습니다.');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

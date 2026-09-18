// 로컬 55초 이하 샘플만 직접 전송한다. DB·OCI·GCS에는 쓰지 않는다.
import { GoogleAuth } from 'google-auth-library';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { recognitionRequest } from '../lib/server/chirp-transcription.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('node --experimental-strip-types --env-file=.env scripts/check-chirp.mjs --file <녹음 경로> [--start 0] [--seconds 55]');
  console.log('Google Chirp 3 유료 호출 1회. 최대 55초. 비공개 임시 디렉터리에 샘플·전사 TXT·JSON·검증 정보를 저장합니다.');
  process.exit(0);
}
let directory;
let requestStarted = false;
try {
  const allowed = new Set(['--file', '--start', '--seconds']);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || args[i + 1] === undefined || Object.hasOwn(options, args[i])) throw new Error('INVALID_ARGUMENTS');
    options[args[i]] = args[i + 1];
  }
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_SPEECH_LOCATION || 'us';
  if (!project || !/^[a-z][a-z0-9-]{4,62}$/.test(project) || !/^[a-z][a-z0-9-]+$/.test(location) || location === 'global') throw new Error('GOOGLE_CONFIGURATION');
  if (!options['--file']) throw new Error('MISSING_AUDIO_FILE');
  const file = resolve(options['--file']);
  if (!(await stat(file)).isFile()) throw new Error('INVALID_AUDIO_FILE');
  const start = Number(options['--start'] ?? 0);
  const seconds = Number(options['--seconds'] ?? 55);
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(seconds) || seconds < 1 || seconds > 55) throw new Error('INVALID_CLIP_RANGE');
  directory = await mkdtemp(join(tmpdir(), 'pm-chirp-check-'));
  await chmod(directory, 0o700);
  const sample = join(directory, 'sample.flac');
  await promisify(execFile)('ffmpeg', ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', String(start), '-i', file, '-t', String(seconds), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', sample], { timeout: 60_000, maxBuffer: 16_384 });
  await chmod(sample, 0o600);
  const audio = await readFile(sample);
  if (!audio.length || audio.length > 9 * 1024 * 1024) throw new Error('INVALID_SAMPLE_SIZE');
  const { config } = recognitionRequest({model:'chirp_3',language:'ko-KR'}, '');
  // 이 도구는 짧은 Recognize 연결 검사다. 화자 구분은 운영 BatchRecognize에서만 켠다.
  delete config.features.diarizationConfig;
  const auth = new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
  const startedAt = new Date().toISOString();
  const startTime = performance.now();
  requestStarted = true;
  const { data } = await auth.request({
    url:`https://${location}-speech.googleapis.com/v2/projects/${project}/locations/${location}/recognizers/_:recognize`,
    method:'POST', timeout:120_000, retry:false, data:{config,content:audio.toString('base64')},
  });
  const elapsedMs = Math.round(performance.now() - startTime);
  const text = (data.results ?? []).map(row => row.alternatives?.[0]?.transcript ?? '').filter(Boolean).join('\n');
  await writeFile(join(directory,'transcript.txt'), text, {mode:0o600});
  await writeFile(join(directory,'response.json'), JSON.stringify(data,null,2), {mode:0o600});
  const report = {status:text.trim()?'PASS':'NO_SPEECH',startedAt,elapsedMs,project,location,model:'chirp_3',source:file,start,requestedSeconds:seconds,sampleSha256:createHash('sha256').update(audio).digest('hex'),sampleBytes:audio.length,config,resultCount:data.results?.length??0,billedDuration:data.metadata?.totalBilledDuration??null};
  await writeFile(join(directory,'report.json'), JSON.stringify(report,null,2), {mode:0o600});
  console.log(JSON.stringify({status:report.status,elapsedMs,directory,billedDuration:report.billedDuration}));
} catch (error) {
  // Gaxios/ffmpeg 오류 객체에는 인증 헤더·입력 바이트·민감 경로가 포함될 수 있다.
  const api = error.response?.data?.error;
  const report = {status:'FAIL',requestStarted,httpStatus:error.response?.status??null,code:api?.status??(/^[A-Z_]+$/.test(error.message)?error.message:'LOCAL_CHECK_FAILED'),reason:api?.details?.find(item=>item.reason)?.reason??null,permission:api?.details?.find(item=>item.metadata?.permission)?.metadata.permission??null};
  if (directory) await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.error(JSON.stringify({...report,directory}));
  process.exitCode=1;
}

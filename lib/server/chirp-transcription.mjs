import { createGoogleRuntimeAuth } from './google-runtime-auth.mjs';
import { createHash } from 'node:crypto';

export function speechConfig(env = process.env) {
  const project = env.GOOGLE_CLOUD_PROJECT;
  const projectNumber = env.GOOGLE_CLOUD_PROJECT_NUMBER || undefined;
  if (projectNumber !== undefined && !/^[1-9][0-9]{4,19}$/.test(projectNumber)) throw new Error('SPEECH_CONFIGURATION');
  const location = env.GOOGLE_SPEECH_LOCATION || 'us';
  const bucket = env.GOOGLE_SPEECH_BUCKET;
  if (!project || !/^[a-z][a-z0-9-]{4,62}$/.test(project) || !/^[a-z][a-z0-9-]+$/.test(location) || location === 'global' || !bucket || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) throw new Error('SPEECH_CONFIGURATION');
  return { project, projectNumber, location, bucket, model: 'chirp_3', language: 'ko-KR', endpoint: `https://${location}-speech.googleapis.com/v2` };
}
export function recognitionRequest(config, uri) {
  return {
    config: {
      autoDecodingConfig: {}, model: config.model, languageCodes: [config.language],
      features: { enableAutomaticPunctuation: true,
        // 전체 파일의 발화 흐름을 기준으로 화자를 구분한다. 시간 오프셋은 요청하지 않는다.
        diarizationConfig: {} },
    },
    files: [{ uri }], recognitionOutputConfig: { inlineResponseConfig: {} },
  };
}
export function parseRecognition(operation, uri) {
  if (!operation.done) return null;
  if (operation.error) throw new Error(`SPEECH_${operation.error.code || 'FAILED'}`);
  const file = operation.response?.results?.[uri];
  if (!file || file.error?.code) throw new Error(`SPEECH_${file?.error?.code || 'EMPTY_RESULT'}`);
  const result = file.inlineResult?.transcript ?? file.transcript;
  const lines = result?.results;
  if (!Array.isArray(lines)) throw new Error('SPEECH_EMPTY_RESULT');
  const turns = [];
  for (const item of lines) {
    const alternative = item.alternatives?.[0];
    const words = Array.isArray(alternative?.words) ? alternative.words.filter(word => word?.word?.trim()) : [];
    const labeled = words.length > 0 && words.every(word => String(word.speakerLabel ?? '').trim());
    if (!labeled) {
      const speech = alternative?.transcript?.trim();
      if (speech) turns.push({ speaker: null, words: [speech] });
      continue;
    }
    for (const word of words) {
      const speaker = String(word.speakerLabel).trim();
      const current = turns.at(-1);
      if (current?.speaker === speaker) current.words.push(word.word.trim());
      else turns.push({ speaker, words: [word.word.trim()] });
    }
  }
  const text = turns.map(turn => `${turn.speaker ? `화자 ${turn.speaker}: ` : ''}${turn.words.join(' ')}`).join('\n');
  if (!text.trim() || text.includes('\0') || Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('SPEECH_EMPTY_RESULT');
  return { text, language: lines.find(item => item.languageCode)?.languageCode ?? 'ko-KR', result };
}
export class ChirpTranscription {
  constructor(config = speechConfig(), auth = createGoogleRuntimeAuth()) {
    this.config = config;
    this.auth = auth;
  }
  async request(options) {
    // batchRecognize에는 멱등성 키가 없다. 불명확한 응답을 자동 재전송하지 않는다.
    return (await this.auth.request({ timeout: 60_000, retry: false, ...options })).data;
  }
  staging(recording) {
    const name = `transcription/${recording.id}/${recording.storage.sha256}`;
    return { bucket: this.config.bucket, name, uri: `gs://${this.config.bucket}/${name}` };
  }
  validateStage(stage) {
    if (stage?.bucket !== this.config.bucket || !/^transcription\/[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(stage.name) || stage.uri !== `gs://${stage.bucket}/${stage.name}`) throw new Error('SPEECH_STAGING_REFERENCE');
  }
  async upload(stage, bytes, contentType) {
    this.validateStage(stage);
    let metadata;
    try {
      metadata = await this.request({ method: 'POST', url: `https://storage.googleapis.com/upload/storage/v1/b/${stage.bucket}/o`,
        params: { uploadType: 'media', name: stage.name, ifGenerationMatch: '0' },
        headers: { 'Content-Type': contentType }, data: bytes });
    } catch (error) {
      if (error.response?.status !== 412) throw error;
      metadata = await this.request({ url: `https://storage.googleapis.com/storage/v1/b/${stage.bucket}/o/${encodeURIComponent(stage.name)}` });
    }
    if (Number(metadata.size) !== bytes.length || metadata.md5Hash !== createHash('md5').update(bytes).digest('base64')) throw new Error('SPEECH_STAGING_INTEGRITY');
  }
  async start(stage) {
    this.validateStage(stage);
    const c = this.config;
    const operation = await this.request({ method: 'POST', url: `${c.endpoint}/projects/${c.project}/locations/${c.location}/recognizers/_:batchRecognize`, data: recognitionRequest(c, stage.uri) });
    this.operationUrl(operation.name);
    return operation.name;
  }
  operationUrl(name) {
    // Google은 ID로 요청해도 operation에는 프로젝트 번호를 반환한다.
    // 운영자가 확인한 동일 프로젝트 번호만 허용하고 다른 프로젝트/리전은 거부한다.
    const match = typeof name === 'string' && /^projects\/([a-z0-9-]+)\/locations\/([a-z0-9-]+)\/operations\/([a-zA-Z0-9_-]+)$/.exec(name);
    if (!match || ![this.config.project, this.config.projectNumber].includes(match[1]) || match[2] !== this.config.location) throw new Error('SPEECH_OPERATION_REFERENCE');
    return `${this.config.endpoint}/${name}`;
  }
  async poll(name) { return this.request({ url: this.operationUrl(name) }); }
  async remove(stage) {
    this.validateStage(stage);
    try { await this.request({ method: 'DELETE', url: `https://storage.googleapis.com/storage/v1/b/${stage.bucket}/o/${encodeURIComponent(stage.name)}` }); }
    catch (error) { if (error.response?.status !== 404) throw error; }
  }
}

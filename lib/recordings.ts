export const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
export const RECORDING_KINDS = [
  { value: 'CALL', label: '통화' },
  { value: 'OFFLINE', label: '오프라인 회의' },
  { value: 'ONLINE', label: '온라인 미팅' },
  { value: 'OTHER', label: '기타' },
] as const;
export type RecordingKind = typeof RECORDING_KINDS[number]['value'];
export const RECORDING_STATUS = { PENDING: '전사 대기', PROCESSING: '전사 중', DONE: '전사 완료', FAILED: '전사 실패' } as const;
export type RecordingSummary = {
  id: string; title: string; kind: RecordingKind; context: string; fileName: string; byteLength: number;
  status: keyof typeof RECORDING_STATUS; error: string | null; createdAt: string; hasTranscript: boolean;
};
export const recordingsHref = (project: string) => `/flows/${encodeURIComponent(project)}/recordings`;
export function recordingInput(value: Record<string, unknown>) {
  const text = (key: string, max: number, required = false) => {
    const input = value[key];
    if (typeof input !== 'string' || input.trim().length > max || (required && !input.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)) throw new Error(`${key === 'title' ? '제목' : '녹음 상황 설명'}을 확인해 주세요. (최대 ${max}자)`);
    return input.trim();
  };
  if (!RECORDING_KINDS.some(item => item.value === value.kind)) throw new Error('녹음 종류를 선택해 주세요.');
  return { title: text('title', 200, true), kind: value.kind as RecordingKind, context: text('context', 1000) };
}
export function recordingFileType(name: string, bytes: Uint8Array) {
  if (!name || name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(name) || !bytes.length || bytes.length > MAX_RECORDING_BYTES) throw new Error('파일명 또는 크기를 확인해 주세요. 최대 100MB까지 지원합니다.');
  const ext = name.split('.').at(-1)?.toLowerCase();
  const at = (offset: number, text: string) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  const types: Record<string, [string, boolean]> = {
    m4a: ['audio/mp4', at(4, 'ftyp')], mp3: ['audio/mpeg', at(0, 'ID3') || bytes[0] === 255 && (bytes[1] & 224) === 224],
    wav: ['audio/wav', at(0, 'RIFF') && at(8, 'WAVE')], flac: ['audio/flac', at(0, 'fLaC')],
    ogg: ['audio/ogg', at(0, 'OggS')], webm: ['audio/webm', [26, 69, 223, 163].every((n, i) => bytes[i] === n)],
  };
  const type = types[ext ?? ''];
  if (!type?.[1]) throw new Error('유효한 M4A, MP3, WAV, FLAC, OGG 또는 WebM 녹음 파일을 선택해 주세요.');
  return type[0];
}

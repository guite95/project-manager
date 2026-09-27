import { RecruitmentError } from './recruitment.ts';

export const credentialKinds = { CERTIFICATE: '자격증', AWARD: '수상', LANGUAGE: '어학' } as const;
export type CredentialKind = keyof typeof credentialKinds;
export const credentialFields = {
  name: '명칭', issuer: '발급·주관 기관', acquiredOn: '취득·수상일',
  identifier: '자격증·등록 번호', grade: '등급·점수·훈격', expiresOn: '만료일', notes: '메모',
} as const;
export type CredentialField = keyof typeof credentialFields;
export type RecruitmentCredential = { id: string; kind: CredentialKind } & Record<CredentialField, string>;
export type RecruitmentCredentials = { items: RecruitmentCredential[]; revision: number; updatedAt: string | null };
export const credentialsKey = 'recruitment:credentials';

// 원문에 연도나 월만 있는 날짜를 임의의 일자로 보완하지 않는다.
function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return false;
  if (month !== undefined && (month < 1 || month > 12)) return false;
  if (day !== undefined && (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())) return false;
  return true;
}

export function parseRecruitmentCredentials(input: unknown): RecruitmentCredential[] {
  if (!Array.isArray(input) || input.length > 100) throw new RecruitmentError('지원용 정보는 100개까지 저장할 수 있습니다.');
  const ids = new Set<string>();
  const items = input.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RecruitmentError('지원용 정보를 확인하세요.');
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id) || ids.has(row.id)) throw new RecruitmentError('항목 ID가 잘못되었거나 중복되었습니다.');
    ids.add(row.id);
    if (typeof row.kind !== 'string' || !Object.hasOwn(credentialKinds, row.kind)) throw new RecruitmentError('자격증·수상·어학 중 종류를 선택하세요.');
    const item = { id: row.id, kind: row.kind as CredentialKind } as RecruitmentCredential;
    for (const key of Object.keys(credentialFields) as CredentialField[]) {
      const text = row[key];
      const max = key === 'notes' ? 4000 : 200;
      if (typeof text !== 'string' || text.length > max) throw new RecruitmentError(`${credentialFields[key]}은 ${max}자 이내로 입력하세요.`);
      item[key] = text.trim();
    }
    if (!item.name) throw new RecruitmentError('명칭을 입력하세요.');
    if (!validDate(item.acquiredOn) || !validDate(item.expiresOn)) throw new RecruitmentError('날짜는 YYYY, YYYY-MM 또는 YYYY-MM-DD 형식으로 입력하세요.');
    return item;
  });
  if (JSON.stringify(items).length > 80_000) throw new RecruitmentError('지원용 정보는 총 80,000자까지 저장할 수 있습니다.', 413);
  return items;
}

export function credentialText(item: RecruitmentCredential) {
  return [credentialKinds[item.kind], ...Object.entries(credentialFields).flatMap(([key, label]) => {
    const value = item[key as CredentialField];
    return value ? [`${label}: ${value}`] : [];
  })].join('\n');
}

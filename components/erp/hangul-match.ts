const CHOSEONG = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

const isChoseongQuery = (value: string) => /^[ㄱ-ㅎ]+$/.test(value);

function toChoseong(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint < 0xac00 || codePoint > 0xd7a3) {
      return character.toLowerCase();
    }
    return CHOSEONG[Math.floor((codePoint - 0xac00) / 588)];
  }).join("");
}

export function hangulIncludes(value: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const normalizedValue = value.toLowerCase();
  if (normalizedValue.includes(normalizedQuery)) return true;
  return isChoseongQuery(normalizedQuery)
    ? toChoseong(normalizedValue).includes(normalizedQuery)
    : false;
}

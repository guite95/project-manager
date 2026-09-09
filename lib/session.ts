/**
 * 세션 토큰은 `만료시각.서명` 이다. 서명은 만료시각 문자열에 대한 HMAC-SHA256.
 *
 * 미들웨어에서도 그대로 돌아야 하므로 `node:crypto` 가 아니라 표준 Web Crypto 만
 * 쓴다. 비밀번호 해시는 `lib/password.ts` 에 따로 있다.
 */

export const SESSION_COOKIE_NAME = "pm_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/** 길이가 달라도 이른 반환으로 정보를 흘리지 않게 고정 시간 비교를 흉내낸다. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  secret: string,
  expiresAt: number,
): Promise<string> {
  const payload = String(expiresAt);
  return `${payload}.${await sign(payload, secret)}`;
}

/** 형식이 어긋나거나 서명이 맞지 않거나 만료됐으면 false. 절대 던지지 않는다. */
export async function isSessionTokenValid(
  token: string,
  secret: string,
  now: number,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  const expiresAt = Number(payload);
  if (!Number.isSafeInteger(expiresAt)) return false;

  if (!safeEqual(await sign(payload, secret), signature)) return false;
  return expiresAt > now;
}

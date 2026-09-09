import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** `salt:hash` 형태의 16진 문자열을 만든다. salt 를 넘기면 그 값을 쓴다 (테스트용). */
export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
): Promise<string> {
  const key = await derive(password, Buffer.from(salt, "hex"));
  return `${salt}:${key.toString("hex")}`;
}

/** 저장값 형식이 어긋나도 던지지 않는다. 로그인 실패와 같게 다룬다. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;

  let expectedBuffer: Buffer;
  try {
    expectedBuffer = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (expectedBuffer.length !== KEY_LENGTH) return false;

  const actual = await derive(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(actual, expectedBuffer);
}

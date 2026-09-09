import assert from "node:assert/strict";
import test from "node:test";

const { hashPassword, verifyPassword } = await import("./password.ts");

test("같은 비밀번호는 자기 해시와 대조된다", async () => {
  const stored = await hashPassword("열려라참깨");
  assert.equal(await verifyPassword("열려라참깨", stored), true);
});

test("다른 비밀번호는 대조에 실패한다", async () => {
  const stored = await hashPassword("열려라참깨");
  assert.equal(await verifyPassword("안열려", stored), false);
});

test("같은 비밀번호라도 salt 가 달라 해시가 매번 다르다", async () => {
  const a = await hashPassword("열려라참깨");
  const b = await hashPassword("열려라참깨");
  assert.notEqual(a, b);
});

test("형식이 어긋난 저장값은 던지지 않고 false 를 준다", async () => {
  assert.equal(await verifyPassword("열려라참깨", "쓰레기"), false);
  assert.equal(await verifyPassword("열려라참깨", ""), false);
  assert.equal(await verifyPassword("열려라참깨", "aa:"), false);
});

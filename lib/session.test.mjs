import assert from "node:assert/strict";
import test from "node:test";

const { createSessionToken, isSessionTokenValid } = await import("./session.ts");

const SECRET = "테스트-서명키";
const NOW = 1_757_000_000_000;

test("만료 전 토큰은 유효하다", async () => {
  const token = await createSessionToken(SECRET, NOW + 1000);
  assert.equal(await isSessionTokenValid(token, SECRET, NOW), true);
});

test("만료된 토큰은 무효다", async () => {
  const token = await createSessionToken(SECRET, NOW - 1);
  assert.equal(await isSessionTokenValid(token, SECRET, NOW), false);
});

test("다른 키로 만든 토큰은 무효다", async () => {
  const token = await createSessionToken("다른키", NOW + 1000);
  assert.equal(await isSessionTokenValid(token, SECRET, NOW), false);
});

test("만료 시각만 바꿔치기하면 서명이 어긋나 무효다", async () => {
  const token = await createSessionToken(SECRET, NOW + 1000);
  const [, signature] = token.split(".");
  const forged = `${NOW + 999_999}.${signature}`;
  assert.equal(await isSessionTokenValid(forged, SECRET, NOW), false);
});

test("형식이 어긋난 토큰은 던지지 않고 무효다", async () => {
  for (const bad of ["", "쓰레기", "abc.def", ".", "123."]) {
    assert.equal(await isSessionTokenValid(bad, SECRET, NOW), false);
  }
});

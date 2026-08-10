import assert from "node:assert/strict";
import test from "node:test";
import { hangulIncludes } from "./hangul-match.ts";

test("일반 문자열을 대소문자 구분 없이 검색한다", () => {
  assert.equal(hangulIncludes("Republic of Korea", "KOREA"), true);
  assert.equal(hangulIncludes("대한민국", "대한"), true);
});

test("한글 음절을 초성 문자열로 검색한다", () => {
  assert.equal(hangulIncludes("대한민국", "ㄷㅎ"), true);
  assert.equal(hangulIncludes("대한민국", "ㅁㄱ"), true);
  assert.equal(hangulIncludes("대한민국", "ㅅㅇ"), false);
});

test("공백 검색어는 모든 문자열에 일치한다", () => {
  assert.equal(hangulIncludes("대한민국", "  "), true);
});

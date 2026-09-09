/**
 * 비밀번호 해시를 만든다. 나온 값을 APP_PASSWORD_HASH 환경변수에 넣는다.
 *
 *   node scripts/hash-password.mjs
 *
 * 터미널에서 돌리면 입력한 글자가 화면에 보이지 않는다. 인자로 받지 않는 이유는
 * 셸 히스토리에 비밀번호가 남기 때문이다.
 */
import { createInterface } from "node:readline";
import { hashPassword } from "../lib/password.ts";

const isTty = process.stdin.isTTY === true;

// 인터페이스를 하나만 만든다. 중간에 닫으면 stdin 이 끊겨 다음 질문을 받지 못한다.
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: isTty,
});

let muted = false;
const write = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (chunk) => {
  if (!muted) write?.(chunk);
};

// 비동기 이터레이터는 줄 사이에 스트림을 멈춰 준다. `rl.question` 을 두 번 쓰면
// 파이프로 들어온 둘째 줄이 대기자가 없는 사이에 흘러가 버린다.
const lines = rl[Symbol.asyncIterator]();

async function ask(question) {
  process.stdout.write(question);
  muted = isTty;
  const { value, done } = await lines.next();
  muted = false;
  if (isTty) process.stdout.write("\n");
  return done ? "" : value;
}

try {
  const password = (await ask("새 비밀번호: ")).trim();
  if (!password) {
    console.error("비밀번호가 비어 있습니다.");
    process.exit(1);
  }

  const again = (await ask("한 번 더: ")).trim();
  if (password !== again) {
    console.error("두 입력이 다릅니다.");
    process.exit(1);
  }

  console.log("\nAPP_PASSWORD_HASH 에 아래 값을 넣으세요.\n");
  console.log(await hashPassword(password));
} finally {
  rl.close();
}

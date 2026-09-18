import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makePptx } from '../test-helpers/pptx.mjs';

const pptx = makePptx();

async function fakeLibreOffice(output) {
  const dir = await mkdtemp(join(tmpdir(), 'pm-fake-libreoffice-'));
  const executable = join(dir, 'soffice');
  const source = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const outdir = args[args.indexOf('--outdir') + 1];
fs.writeFileSync(path.join(outdir, 'source.pdf'), Buffer.from(${JSON.stringify(output.toString('base64'))}, 'base64'));
`;
  await writeFile(executable, source);
  await chmod(executable, 0o700);
  return { dir, executable };
}

async function fakeLibreOfficeSource(body) {
  const dir = await mkdtemp(join(tmpdir(), 'pm-fake-libreoffice-'));
  const executable = join(dir, 'soffice');
  await writeFile(executable, `#!/usr/bin/env node\n${body}\n`);
  await chmod(executable, 0o700);
  return { dir, executable };
}

test('PPTX를 격리된 LibreOffice 프로세스로 변환하고 유효한 PDF만 반환한다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const pdf = Buffer.from('%PDF-1.7\nconverted\n%%EOF\n');
  const fake = await fakeLibreOffice(pdf);
  try {
    assert.deepEqual(await convertPresentationToPdf(pptx, { executable: fake.executable }), pdf);
  } finally { await rm(fake.dir, { recursive: true, force: true }); }
});

test('LibreOffice 결과가 PDF가 아니면 업로드용 미리보기로 받아들이지 않는다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const fake = await fakeLibreOffice(Buffer.from('<html>not pdf</html>'));
  try {
    await assert.rejects(() => convertPresentationToPdf(pptx, { executable: fake.executable }), /PDF/);
  } finally { await rm(fake.dir, { recursive: true, force: true }); }
});

test('외부 연결이 포함된 PPTX는 LibreOffice를 실행하기 전에 거부한다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const external = makePptx({
    'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Target="http://169.254.169.254/opc/v2/instance/" TargetMode="External"/></Relationships>',
  });
  await assert.rejects(() => convertPresentationToPdf(external, { executable: '/does/not/run' }), /외부 연결/);
});

test('XML 문자 참조로 숨긴 외부 연결도 LibreOffice 실행 전에 거부한다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const external = makePptx({
    'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Target="http&#x3a;//169.254.169.254/" TargetMode="Externa&#x6c;"/></Relationships>',
  });
  await assert.rejects(() => convertPresentationToPdf(external, { executable: '/does/not/run' }), /외부 연결/);
});

test('유니코드 네임스페이스 접두사의 외부 연결도 거부한다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const external = makePptx({
    'ppt/slides/_rels/slide1.xml.rels': '<Relationships xmlns:관="urn:test"><관:Relationship Target="http://169.254.169.254/" TargetMode="External"/></Relationships>',
  });
  await assert.rejects(() => convertPresentationToPdf(external, { executable: '/does/not/run' }), /외부 연결/);
});

test('이름을 바꾼 VBA 본문도 콘텐츠 형식으로 식별해 거부한다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const macro = makePptx({
    '[Content_Types].xml': '<Types><Override PartName="/ppt/embeddings/payload.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>',
    'ppt/embeddings/payload.bin': 'macro payload',
  });
  await assert.rejects(() => convertPresentationToPdf(macro, { executable: '/does/not/run' }), /매크로/);
});

test('LibreOffice 자식 프로세스에는 애플리케이션 비밀 환경 변수를 전달하지 않는다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const fake = await fakeLibreOfficeSource(`
if (process.env.PPTX_TEST_SECRET) process.exit(42);
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const outdir = args[args.indexOf('--outdir') + 1];
fs.writeFileSync(path.join(outdir, 'source.pdf'), Buffer.from('%PDF-1.7\\nconverted\\n%%EOF\\n'));
`);
  process.env.PPTX_TEST_SECRET = 'must-not-leak';
  try {
    await assert.doesNotReject(() => convertPresentationToPdf(pptx, { executable: fake.executable }));
  } finally {
    delete process.env.PPTX_TEST_SECRET;
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('크기 제한을 넘는 변환 결과는 읽기 전에 거부한다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const fake = await fakeLibreOfficeSource(`
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const output = path.join(args[args.indexOf('--outdir') + 1], 'source.pdf');
fs.writeFileSync(output, '%PDF-1.7\\n');
fs.truncateSync(output, 17 * 1024 * 1024);
`);
  try {
    await assert.rejects(() => convertPresentationToPdf(pptx, { executable: fake.executable }), /크기/);
  } finally { await rm(fake.dir, { recursive: true, force: true }); }
});

test('동시 PPTX 변환은 한 프로세스씩 실행한다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const lock = join(tmpdir(), `pm-pptx-lock-${process.pid}-${Date.now()}`);
  const fake = await fakeLibreOfficeSource(`
const fs = require('node:fs');
const path = require('node:path');
const lock = ${JSON.stringify(lock)};
try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); } catch { process.exit(43); }
setTimeout(() => {
  const args = process.argv.slice(2);
  fs.writeFileSync(path.join(args[args.indexOf('--outdir') + 1], 'source.pdf'), Buffer.from('%PDF-1.7\\nconverted\\n%%EOF\\n'));
  fs.rmSync(lock, { force: true });
}, 80);
`);
  try {
    await assert.doesNotReject(() => Promise.all([
      convertPresentationToPdf(pptx, { executable: fake.executable }),
      convertPresentationToPdf(pptx, { executable: fake.executable }),
    ]));
  } finally {
    await rm(lock, { force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('압축 해제 크기를 속인 PPTX는 LibreOffice를 실행하기 전에 거부한다', async () => {
  const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
  const bomb = makePptx();
  const central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bomb.writeUInt32LE(1, central + 24);
  await assert.rejects(() => convertPresentationToPdf(bomb, { executable: '/does/not/run' }), /압축/);
});

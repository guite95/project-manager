import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makePptx } from '../test-helpers/pptx.mjs';

const pptx = makePptx();

async function fakeLibreOffice() {
  const dir = await mkdtemp(join(tmpdir(), 'pm-fake-upload-'));
  const executable = join(dir, 'soffice');
  await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const outdir = args[args.indexOf('--outdir') + 1];
fs.writeFileSync(path.join(outdir, 'source.pdf'), '%PDF-1.7\\npreview\\n%%EOF\\n');
`);
  await chmod(executable, 0o700);
  return { dir, executable };
}

test('PPTX 업로드 콘텐츠에 원본과 같은 이름의 PDF 미리보기를 생성한다', async () => {
  const { prepareMaterialContent } = await import('./material-upload.ts');
  const fake = await fakeLibreOffice();
  try {
    const content = await prepareMaterialContent('분기 보고.PPTX', pptx, { executable: fake.executable });
    assert.equal(content.format, 'pptx');
    assert.equal(content.fileName, '분기 보고.PPTX');
    assert.equal(content.preview.fileName, '분기 보고.pdf');
    assert.equal(Buffer.from(content.preview.data, 'base64').toString(), '%PDF-1.7\npreview\n%%EOF\n');
  } finally { await rm(fake.dir, { recursive: true, force: true }); }
});

test('지원하지 않는 확장자와 손상된 PPTX를 저장용 콘텐츠로 만들지 않는다', async () => {
  const { prepareMaterialContent } = await import('./material-upload.ts');
  await assert.rejects(() => prepareMaterialContent('자료.exe', Buffer.from('bad')), /PDF, HTML 또는 PPTX/);
  await assert.rejects(() => prepareMaterialContent('자료.pptx', Buffer.from('bad')), /PPTX/);
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const runRealConverter = process.env.PPTX_REAL_CONVERTER === '1';

const flatPresentation = `<?xml version="1.0" encoding="UTF-8"?>
<office:document
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.3"
  office:mimetype="application/vnd.oasis.opendocument.presentation">
  <office:styles/>
  <office:automatic-styles>
    <style:page-layout style:name="pm1">
      <style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm" style:print-orientation="landscape"/>
    </style:page-layout>
    <style:style style:name="dp1" style:family="drawing-page"/>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Default" style:page-layout-name="pm1" draw:style-name="dp1"/>
  </office:master-styles>
  <office:body>
    <office:presentation>
      <draw:page draw:name="page1" draw:master-page-name="Default">
        <draw:frame presentation:class="title" svg:x="2cm" svg:y="2cm" svg:width="24cm" svg:height="3cm">
          <draw:text-box><text:p>Project Management PPTX smoke test</text:p></draw:text-box>
        </draw:frame>
      </draw:page>
    </office:presentation>
  </office:body>
</office:document>
`;

function libreOfficeEnvironment() {
  const environment = { SAL_DISABLE_OPENCL: '1' };
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ']) {
    if (typeof process.env[key] === 'string') environment[key] = process.env[key];
  }
  return environment;
}

test('운영 이미지의 실제 LibreOffice로 PPTX를 PDF로 변환한다', { skip: !runRealConverter }, async () => {
  const executable = process.env.LIBREOFFICE_BIN || 'soffice';
  const root = await mkdtemp(join(tmpdir(), 'pm-real-pptx-'));
  const sourcePath = join(root, 'source.fodp');
  const outputDir = join(root, 'output');
  try {
    await mkdir(outputDir, { mode: 0o700 });
    await writeFile(sourcePath, flatPresentation, { mode: 0o600 });
    await execute(executable, [
      '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
      `-env:UserInstallation=${pathToFileURL(join(root, 'profile')).href}`,
      '--convert-to', 'pptx', '--outdir', outputDir, sourcePath,
    ], { timeout: 60_000, maxBuffer: 1024 * 1024, env: libreOfficeEnvironment() });

    const pptx = await readFile(join(outputDir, 'source.pptx'));
    const { convertPresentationToPdf } = await import('./presentation-converter.mjs');
    const pdf = await convertPresentationToPdf(pptx, { executable, timeoutMs: 60_000 });

    assert.match(pdf.subarray(0, 8).toString('binary'), /^%PDF-\d\.\d/);
    assert.ok(pdf.subarray(Math.max(0, pdf.length - 1024)).includes(Buffer.from('%%EOF')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

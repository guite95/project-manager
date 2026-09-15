export const MAX_MATERIAL_BYTES = 10 * 1024 * 1024;
export const MATERIAL_CATEGORY = 'project-materials';
export type MaterialContent = {
  kind: 'material'; format: 'pdf' | 'html'; fileName: string; byteLength: number; data: string;
};
export type MaterialSummary = {
  slug: string; title: string; description: string | null; format: string;
  fileName: string | null; byteLength: number | null; updatedAt: string;
};
export function materialsHref(project: string, material?: string) {
  return `/flows/${encodeURIComponent(project)}/materials${material ? `/${encodeURIComponent(material)}` : ''}`;
}

/** 브라우저와 서버 양쪽에서 같은 파일 경계를 검증한다. */
export function validateMaterial(value: Record<string, unknown>): asserts value is MaterialContent {
  const fail = () => { throw new Error('올바른 PDF 또는 UTF-8 HTML 파일(최대 10MB)이 필요합니다.'); };
  if (value.kind !== 'material' || !['pdf', 'html'].includes(value.format as string) ||
      typeof value.fileName !== 'string' || !value.fileName.trim() || value.fileName.length > 255 || /[\\/\x00-\x1f\x7f]/.test(value.fileName) ||
      !Number.isSafeInteger(value.byteLength) || (value.byteLength as number) < 1 || (value.byteLength as number) > MAX_MATERIAL_BYTES ||
      typeof value.data !== 'string' || value.data.length > Math.ceil(MAX_MATERIAL_BYTES / 3) * 4) fail();
  const data = value.data as string;
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) fail();
  const binary = atob(data);
  if (binary.length !== value.byteLength || btoa(binary) !== data) fail();
  if (value.format === 'pdf') {
    if (!/\.pdf$/i.test(value.fileName as string) || !/^%PDF-\d\.\d/.test(binary) || !binary.slice(-1024).includes('%%EOF')) fail();
  } else {
    if (!/\.html?$/i.test(value.fileName as string)) fail();
    let html: string;
    try { html = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))); }
    catch { return fail(); }
    if (html.includes('\0') || !/<(?:!doctype\s+html|html|head|body|main|section|article|div|h[1-6]|p|table|style)\b/i.test(html)) fail();
  }
}

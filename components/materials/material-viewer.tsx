"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/erp/button";
import { Badge } from "@/components/erp/badge";
import { usePathname } from 'next/navigation';
import { HtmlDocumentViewer } from './html-document-viewer';
import type { MaterialContent } from '@/lib/materials';

const button = 'inline-flex min-h-10 items-center justify-center rounded border border-[var(--bi-border)] px-3 text-[12px] hover:bg-[var(--bi-sidebar-active)]';

export function MaterialViewer({ content, title }: { content: MaterialContent; title: string }) {
  const [file, setFile] = useState<{ url: string; html: string } | null>(null);
  const [error, setError] = useState('');
  const frame = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const bytes = Uint8Array.from(atob(content.data), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: content.format === 'pdf' ? 'application/pdf' : 'text/html;charset=utf-8' }));
    setFile({ url, html: content.format === 'html' ? new TextDecoder().decode(bytes) : '' });
    return () => URL.revokeObjectURL(url);
  }, [content]);
  return <section aria-label="자료 미리보기">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Badge variant="primary">{content.format.toUpperCase()}</Badge>
      <span className="min-w-0 flex-1 break-all text-[12px] text-[var(--bi-muted)]">{content.fileName} · {(content.byteLength / 1024 / 1024).toFixed(2)} MB</span>
      {file ? <a className={button} href={file.url} download={content.fileName}>원본 다운로드</a> : null}
      {content.format === 'pdf' ? <><a className={button} href={pathname} target="_blank" rel="noopener noreferrer">새 창 ↗</a>
      <Button variant="secondary" onClick={async () => {
        try { await frame.current?.requestFullscreen(); }
        catch { setError('이 브라우저에서는 전체화면을 지원하지 않습니다.'); }
      }}>전체화면</Button></> : null}
    </div>
    {content.format === 'pdf' ? <p className="mb-2 text-[12px] text-[var(--bi-muted)]">PDF 뷰어에서 페이지 이동과 확대를 할 수 있습니다. 미리보기가 지원되지 않으면 원본을 다운로드해 주세요.</p> : null}
    {error ? <p role="status" className="mb-3 text-[12px]">{error}</p> : null}
    {file && content.format === 'html' ? <HtmlDocumentViewer html={file.html} title={title} /> : <div ref={frame} className="h-[78dvh] min-h-[420px] overflow-hidden rounded border border-[var(--bi-border)] bg-white fullscreen:h-screen fullscreen:rounded-none">
      {!file ? <p className="p-6 text-sm text-gray-600" role="status">자료를 불러오는 중입니다…</p>
        : <iframe title={title} src={`${file.url}#view=FitH`} referrerPolicy="no-referrer" className="h-full w-full border-0" />}
    </div>}
  </section>;
}

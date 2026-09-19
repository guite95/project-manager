"use client";

import { useEffect, useRef, useState } from 'react';
import { Dropdown } from "@/components/erp/dropdown";
import { Button } from "@/components/erp/button";
import { buttonClassName } from "@/components/erp/button-styles";
import { usePathname, useSearchParams } from 'next/navigation';
import { sandboxedDocument } from '@/lib/flows/content';
import { parseHtmlPreview, type HtmlPreview } from '@/lib/html-preview';

const buttonLinkClass = buttonClassName({ variant: 'secondary' });

export function HtmlDocumentViewer({ html, title }: { html: string; title: string }) {
  const [preview, setPreview] = useState<HtmlPreview | null>(null);
  const [index, setIndex] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const viewer = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const pathname = usePathname(), params = useSearchParams();
  useEffect(() => { setPreview(parseHtmlPreview(html)); setIndex(0); setContinuous(false); }, [html]);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === viewer.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  const paged = Boolean(preview?.pages.length && !continuous);
  const fixed = Boolean(paged && preview?.width && preview.height);
  const width = preview?.width ?? 1120, height = preview?.height ?? 630;
  useEffect(() => {
    const element = container.current;
    if (!element || !fixed) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(entry.contentRect.width / width, entry.contentRect.height / height));
    });
    observer.observe(element); return () => observer.disconnect();
  }, [fixed, width, height]);
  const current = paged ? preview?.pages[index] : null;
  return <section ref={viewer} aria-label="HTML 문서 보기" style={fullscreen ? { display: 'flex', flexDirection: 'column', height: '100dvh', padding: 12, background: 'var(--bi-card-bg)' } : undefined} onKeyDown={event => {
    if (!paged || event.defaultPrevented || (event.target instanceof Element && event.target.closest('[data-erp-dropdown], input'))) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    if (event.key === 'ArrowRight') { event.preventDefault(); setIndex(i => Math.min(preview!.pages.length - 1, i + 1)); }
  }}>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {paged ? <>
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>이전 페이지</Button>
        <Dropdown className="min-w-0 flex-1" ariaLabel="페이지 선택" searchable value={String(index)} onChange={value => setIndex(Number(value))}
          options={preview!.pages.map((page, i) => ({ value: String(i), label: `${i + 1}. ${page.title}` }))} />
        <span aria-live="polite" className="text-[12px] tabular-nums">{index + 1} / {preview!.pages.length}</span>
        <Button variant="secondary" disabled={index === preview!.pages.length - 1} onClick={() => setIndex(i => i + 1)}>다음 페이지</Button>
      </> : <span className="flex-1 text-[12px] text-[var(--bi-muted)]">문서 보기</span>}
      {preview?.pages.length ? <Button variant="secondary" onClick={() => setContinuous(value => !value)}>{continuous ? '페이지 보기' : '전체 문서'}</Button> : null}
      <a className={buttonLinkClass} href={`${pathname}${params.size ? `?${params}` : ''}`} target="_blank" rel="noopener noreferrer">새 창 ↗</a>
      <Button variant="secondary" onClick={async () => {
        try { if (fullscreen) await document.exitFullscreen(); else await viewer.current?.requestFullscreen(); }
        catch { setError('이 브라우저에서는 전체화면을 지원하지 않습니다.'); }
      }}>{fullscreen ? '전체화면 종료' : '전체화면'}</Button>
    </div>
    {error ? <p role="status" className="mb-2 text-[12px]">{error}</p> : null}
    <div ref={container} tabIndex={0} aria-label="HTML 미리보기 영역" className={`relative w-full overflow-hidden border border-[var(--bi-border)] bg-white ${fullscreen ? 'min-h-0 flex-1' : fixed ? '' : 'h-[calc(100dvh-190px)] min-h-[420px]'}`}
      style={fixed && !fullscreen ? { aspectRatio: `${width} / ${height}` } : undefined}>
      <iframe key={paged ? `page-${index}` : 'document'} title={current ? `${title} — ${index + 1}페이지` : title} sandbox="" referrerPolicy="no-referrer"
        srcDoc={sandboxedDocument(current?.html ?? html)}
        className={fixed ? 'absolute left-1/2 top-1/2 border-0' : 'h-full w-full border-0'}
        style={fixed ? { width, height, transform: `translate(-50%, -50%) scale(${scale})` } : undefined} />
    </div>
  </section>;
}

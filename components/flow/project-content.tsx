"use client";

import { useState } from "react";
import { MeetingDetail } from "@/components/meetings/meeting-detail";
import type { FlowChart } from "./types";
import { ProcessFlow } from "./process-flow";
import { sandboxedDocument, type ProjectContent } from "@/lib/flows/content";

const button = "min-h-10 rounded border border-[var(--bi-border)] px-3 text-[12px] disabled:opacity-40";

function DocumentFrame({ html, title }: { html: string; title: string }) {
  return <iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxedDocument(html)}
    className="h-[75dvh] min-h-[480px] w-full rounded border border-[var(--bi-border)] bg-white" />;
}

function Slides({ content }: { content: Extract<ProjectContent, { kind: "slides" }> }) {
  const [index, setIndex] = useState(0);
  const slide = content.slides[index];
  return <section aria-label="킥오프 발표 자료">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button className={button} disabled={index === 0} onClick={() => setIndex(i => i - 1)}>이전 슬라이드</button>
      <label className="min-w-0 flex-1 text-[12px]">슬라이드 선택
        <select className="ml-2 max-w-full rounded border border-[var(--bi-border)] p-2" value={index} onChange={e => setIndex(Number(e.target.value))}>
          {content.slides.map((item, i) => <option key={i} value={i}>{i + 1}. {item.title}</option>)}
        </select>
      </label>
      <span className="text-[12px]">{index + 1} / {content.slides.length}</span>
      <button className={button} disabled={index === content.slides.length - 1} onClick={() => setIndex(i => i + 1)}>다음 슬라이드</button>
    </div>
    <DocumentFrame title={`슬라이드 ${index + 1}: ${slide.title}`} html={`<style>${content.styles}</style>${slide.html}`} />
  </section>;
}

function Schedule({ content }: { content: Extract<ProjectContent, { kind: "schedule" }> }) {
  const all = content.phases.flatMap(p => p.groups.flatMap(g => g.items));
  const completed = all.filter(i => i.completed).length;
  return <section aria-label="프로젝트 일정">
    <h3 className="text-[16px] font-bold">{content.title}</h3>
    <p className="my-3 text-[12px] text-[var(--bi-muted)]">{content.startISO} ~ {content.endISO} · 완료 {completed}/{all.length} · 진행률 {Math.round(completed / Math.max(1, all.length) * 100)}%</p>
    <p className="mb-4 text-[12px] text-[var(--bi-muted)]">가져온 시점의 일정과 완료 상태입니다.</p>
    <div className="space-y-4">{content.phases.map((phase, index) => {
      const items = phase.groups.flatMap(g => g.items);
      return <section key={index} className="rounded border border-[var(--bi-border)] p-4">
        <h4 className="font-bold">{phase.label} <span className="text-[12px] font-normal">{items.filter(i => i.completed).length}/{items.length}</span></h4>
        <p className="mb-3 text-[12px] text-[var(--bi-muted)]">{phase.subtitle}</p>
        {phase.groups.map((group, i) => <div key={i} className="mb-4 last:mb-0">
          <h5 className="mb-2 text-[13px] font-semibold">{group.title}</h5>
          <ul className="space-y-2">{group.items.map(item => <li key={item.id} className="flex items-start gap-2 text-[12px]">
            <span aria-label={item.completed ? "완료" : "미완료"} className="shrink-0">{item.completed ? "☑" : "☐"}</span>
            <span>{item.title}{item.startISO ? <span className="ml-2 text-[10px] text-[var(--bi-muted)]">{item.startISO} ~ {item.endISO}</span> : null}</span>
          </li>)}</ul>
        </div>)}
      </section>;
    })}</div>
  </section>;
}

function ImportedErd({ chart, content }: { chart: FlowChart; content: Extract<ProjectContent, { kind: "erd" }> }) {
  const [selected, setSelected] = useState(content.tables[0]?.name ?? "");
  const [query, setQuery] = useState("");
  const table = content.tables.find(t => t.name === selected);
  const tables = content.tables.filter(t => `${t.name} ${t.koLabel} ${t.module}`.toLowerCase().includes(query.toLowerCase()));
  const relations = content.relations.filter(r => r.from === selected || r.to === selected);
  return <section aria-label="ERD 테이블과 관계">
    <p className="mb-3 text-[12px]">테이블 {content.tables.length}개 · FK 관계 {content.relations.length}개 · 테이블을 선택하면 전체 컬럼과 관계를 확인할 수 있습니다.</p>
    <ProcessFlow chart={chart} onEntitySelect={setSelected} />
    <div className="my-4 flex flex-wrap gap-2">
      <input aria-label="테이블 검색" placeholder="테이블·모듈 검색" value={query} onChange={e => setQuery(e.target.value)} className="min-h-10 rounded border border-[var(--bi-border)] px-3 text-[12px]" />
      <select aria-label="테이블 선택" value={selected} onChange={e => setSelected(e.target.value)} className="min-h-10 max-w-full rounded border border-[var(--bi-border)] p-2 text-[12px]">
        {!tables.some(t => t.name === selected) && table ? <option value={table.name}>{table.koLabel} · {table.name}</option> : null}
        {tables.map(t => <option key={t.name} value={t.name}>{t.module} · {t.koLabel} · {t.name}</option>)}
      </select>
      {!tables.length ? <span className="self-center text-[12px]">검색 결과가 없습니다.</span> : null}
    </div>
    {table ? <div className="rounded border border-[var(--bi-border)] p-4">
      <h3 className="font-bold">{table.koLabel} · {table.name}</h3>
      <p className="my-2 text-[12px]">{table.koDesc}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-[12px]">
        <thead><tr>{["키", "컬럼", "설명", "타입", "NULL"].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead>
        <tbody>{table.columns.map(column => <tr key={column.name} className="border-t border-[var(--bi-border)]">
          <td className="p-2">{[column.isPk ? "PK" : "", column.isFk ? "FK" : ""].filter(Boolean).join(" · ")}</td>
          <td className="p-2 font-mono">{column.name}</td><td className="p-2">{column.label}</td><td className="p-2">{column.type}</td><td className="p-2">{column.nullable ? "허용" : "불가"}</td>
        </tr>)}</tbody>
      </table></div>
      <h4 className="mt-4 mb-2 text-[13px] font-bold">연결 관계 · {relations.length}개</h4>
      <ul className="space-y-2 text-[12px]">{relations.map((r, i) => <li key={i} className="break-all">
        <button className="underline" onClick={() => setSelected(r.from)}>{r.from}</button>.{r.fromColumn} → <button className="underline" onClick={() => setSelected(r.to)}>{r.to}</button>.{r.toColumn}
      </li>)}</ul>
    </div> : null}
  </section>;
}

export function ProjectContentView({ chart }: { chart: FlowChart }) {
  const content = chart.content;
  if (!content) return null;
  if (content.kind === "meeting") return <MeetingDetail content={content} />;
  if (content.kind === "schedule") return <Schedule content={content} />;
  if (content.kind === "slides") return <Slides content={content} />;
  if (content.kind === "erd") return <ImportedErd chart={chart} content={content} />;
  if (content.kind === "html") return <section>
    <button className={`${button} mb-3`} onClick={() => {
      const url = URL.createObjectURL(new Blob([sandboxedDocument(content.html)], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = `${chart.slug}.html`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>HTML 저장</button>
    <DocumentFrame title={chart.title} html={content.html} />
  </section>;
  return <p className="whitespace-pre-wrap rounded border border-[var(--bi-border)] p-6 text-[13px]">{content.text}</p>;
}

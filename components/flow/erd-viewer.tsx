"use client";

import { useMemo, useState } from 'react';
import { domainOf, fieldKeys, makeErdChart, type ErdSnapshot } from '../../lib/erd/chart';
import { ProcessFlow } from './process-flow';

export function ErdViewer({ domain, snapshot: tnsSchema }: { domain: string; snapshot: ErdSnapshot }) {
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const chart = useMemo(() => makeErdChart(tnsSchema, domain, selected || undefined), [tnsSchema, domain, selected]);
  const model = tnsSchema.models.find(m => m.name === selected);
  const options = tnsSchema.models.filter(m => !query.trim()
    ? chart.nodes.some(n => n.id === m.name)
    : `${m.name} ${m.table} ${domainOf(m.name).title}`.toLowerCase().includes(query.trim().toLowerCase()));
  const relations = model ? tnsSchema.relations.filter(r => r.source === model.name || r.target === model.name) : [];
  const controlClass = 'rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-1.5 text-[12px] text-[var(--bi-fg)]';
  return (
    <>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-[var(--bi-muted)]">
          전체 테이블 검색
          <input className={controlClass} value={query} onChange={e => setQuery(e.target.value)} placeholder="테이블명 또는 업무 영역" type="search" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-[var(--bi-muted)]">
          테이블 선택 · 연결 및 전체 컬럼 보기
          <select className={`${controlClass} max-w-full`} value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">영역 전체 보기</option>
            {selected && !options.some(m => m.name === selected) ? <option value={selected}>{selected}</option> : null}
            {options.map(m => <option key={m.name} value={m.name}>{m.table} · {domainOf(m.name).title}</option>)}
          </select>
        </label>
        {selected ? <button className={controlClass} onClick={() => { setSelected(''); setQuery(''); }}>영역 전체로 돌아가기</button> : null}
        {query && !options.length ? <span role="status" className="text-[12px] text-[var(--bi-muted)]">검색 결과가 없습니다.</span> : null}
      </div>
      <p className="my-2 text-[11px] leading-relaxed text-[var(--bi-muted)]">
        PK 기본 키 · FK 외래 키 · UQ 단일 고유 키 · ? NULL 허용 · 실선 필수 참조 / 점선 선택 참조<br />
        테이블을 클릭하거나 위에서 선택하면 해당 테이블 중심으로 연결과 전체 컬럼을 확인합니다.
      </p>
      <ProcessFlow chart={chart} height={640} onEntitySelect={setSelected} />
      {model ? (
        <section aria-label="테이블 상세" className="mt-4 text-[12px]">
          <h3 className="mb-1 font-semibold">{model.table} · 전체 {model.fields.length}개 컬럼</h3>
          <p className="mb-2 text-[var(--bi-muted)]">PK: {model.primaryKey.join(' + ') || '없음'}<br />
            고유 제약: {model.uniqueKeys.map(key => `(${key.join(' + ')})`).join(', ') || '없음'}</p>
          <div className="max-h-[420px] overflow-auto rounded border border-[var(--bi-border)]">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-[var(--bi-sidebar-bg)]"><tr>{['키', '컬럼명', '자료형', 'NULL'].map(label => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead>
              <tbody>{model.fields.map(field => <tr key={field.name} className="border-t border-[var(--bi-border)]">
                <td className="px-3 py-1.5 text-[var(--bi-accent)]">{fieldKeys(tnsSchema, model, field).join(' · ') || '—'}</td>
                <td className="px-3 py-1.5 font-mono">{field.column}{field.column !== field.name ? <span className="ml-2 text-[var(--bi-muted)]">({field.name})</span> : null}</td>
                <td className="px-3 py-1.5">{field.type}</td><td className="px-3 py-1.5">{field.optional ? '허용' : '불가'}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <h4 className="mt-4 mb-2 font-semibold">연결 관계 · {relations.length}개</h4>
          <div className="overflow-x-auto rounded border border-[var(--bi-border)]">
            <table className="w-full border-collapse whitespace-nowrap text-left">
              <thead className="bg-[var(--bi-sidebar-bg)]"><tr>{['FK를 가진 테이블 · 컬럼', '참조 테이블 · 컬럼', '관계'].map(label => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead>
              <tbody>{relations.map(r => <tr key={r.id} className="border-t border-[var(--bi-border)]">
                <td className="px-3 py-1.5"><button className="text-[var(--bi-accent)] underline" onClick={() => setSelected(r.source)}>{r.source}</button> · {r.fields.join(', ')}</td>
                <td className="px-3 py-1.5"><button className="text-[var(--bi-accent)] underline" onClick={() => setSelected(r.target)}>{r.target}</button> · {r.references.join(', ')}</td>
                <td className="px-3 py-1.5">{r.unique ? '1:1' : 'N:1'} · {r.optional ? '선택' : '필수'}</td>
              </tr>)}</tbody>
            </table>
            {!relations.length ? <p className="p-3 text-[var(--bi-muted)]">선언된 FK 관계가 없습니다.</p> : null}
          </div>
        </section>
      ) : null}
      <p className="mt-3 break-all text-[10px] text-[var(--bi-muted)]">
        전체 {tnsSchema.models.length}개 테이블 · {tnsSchema.relations.length}개 FK · 스냅샷 {tnsSchema.capturedOn}<br />
        출처: {tnsSchema.source} · SHA-256: {tnsSchema.sha256}
      </p>
    </>
  );
}

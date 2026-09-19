"use client";

import { Dropdown } from "@/components/erp/dropdown";
import { Button } from "@/components/erp/button";

import { useEffect, useMemo, useState } from 'react';
import { domainOf, fieldKeys, makeErdChart, type ErdSnapshot } from '../../lib/erd/chart';
import { ProcessFlow } from './process-flow';
import { parseSavedErdLayout, type SavedErdLayout } from '../../lib/erd/saved-layout';

export function ErdViewer({ domain, snapshot: tnsSchema, initialLayout }: { domain: string; snapshot: ErdSnapshot; initialLayout: SavedErdLayout | null }) {
  const [selected, setSelected] = useState('');
  const [focus, setFocus] = useState('');
  const [query, setQuery] = useState('');
  const chart = useMemo(() => makeErdChart(tnsSchema, domain, focus || undefined), [tnsSchema, domain, focus]);
  const [loaded, setLoaded] = useState<{focus:string;layout:SavedErdLayout|null;error:string}|null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!focus) return;
    const controller = new AbortController();
    setLoaded({focus,layout:null,error:''});
    const query = new URLSearchParams({domain,focus});
    if (initialLayout) query.set('snapshot',initialLayout.snapshotHash);
    void fetch(`/api/erd/tns/layout?${query}`,{signal:controller.signal,cache:'no-store'})
      .then(async response => {
        if (!response.ok) throw new Error('배치를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        const layout = parseSavedErdLayout(await response.json(),chart);
        if (!controller.signal.aborted) setLoaded({focus,layout,error:''});
      }).catch(() => {
        if (!controller.signal.aborted) setLoaded({focus,layout:null,error:'배치를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'});
      });
    return () => controller.abort();
  },[domain,focus,chart,initialLayout,retry]);
  const savedLayout = focus ? loaded?.focus === focus ? loaded.layout : null : initialLayout;
  const layoutError = focus && loaded?.focus === focus ? loaded.error : '';
  const selectTable = (id: string) => {
    setSelected(id);
    if (!id) setFocus('');
    else if (focus || !chart.nodes.some(n => n.id === id)) setFocus(id);
  };
  const model = tnsSchema.models.find(m => m.name === selected);
  const options = tnsSchema.models.filter(m => !query.trim()
    ? chart.nodes.some(n => n.id === m.name)
    : `${m.name} ${m.table} ${domainOf(m.name).title}`.toLowerCase().includes(query.trim().toLowerCase()));
  const relations = model ? tnsSchema.relations.filter(r => r.source === model.name || r.target === model.name) : [];
  const inputClass = 'rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-1.5 text-[12px] text-[var(--bi-fg)]';
  return (
    <>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-[var(--bi-muted)]">
          전체 테이블 검색
          <input className={inputClass} value={query} onChange={e => setQuery(e.target.value)} placeholder="테이블명 또는 업무 영역" type="search" />
        </label>
        <div className="flex min-w-0 flex-col gap-1 text-[11px] text-[var(--bi-muted)]">
          <span>테이블 선택 · 연결 및 전체 컬럼 보기</span>
          <Dropdown ariaLabel="테이블 선택 · 연결 및 전체 컬럼 보기" searchable value={selected} onChange={selectTable}
            options={[{ value: '', label: '영역 전체 보기' },
              ...(selected && !options.some(m => m.name === selected) ? [{ value: selected, label: selected }] : []),
              ...options.map(m => ({ value: m.name, label: `${m.table} · ${domainOf(m.name).title}` }))]} />
        </div>
        {selected && !focus ? <>
          <Button variant="secondary" onClick={() => setFocus(selected)}>선택 테이블 연결만 보기</Button>
          <Button variant="secondary" onClick={() => setSelected('')}>강조 해제</Button>
        </> : null}
        {focus ? <Button variant="secondary" onClick={() => { setFocus(''); setSelected(''); setQuery(''); }}>영역 전체로 돌아가기</Button> : null}
        {query && !options.length ? <span role="status" className="text-[12px] text-[var(--bi-muted)]">검색 결과가 없습니다.</span> : null}
      </div>
      <p className="my-2 text-[11px] leading-relaxed text-[var(--bi-muted)]">
        PK 기본 키 · FK 외래 키 · UQ 단일 고유 키 · ? NULL 허용 · 실선 필수 참조 / 점선 선택 참조<br />
        가까운 관계끼리 묶어 배치합니다. 테이블을 선택하면 배치를 유지한 채 연결과 관계 숫자를 강조합니다.<br />
        영역 전체는 해당 영역에서 나가는 FK를 표시하며, ‘선택 테이블 연결만 보기’에서는 들어오는 FK까지 확인합니다.
      </p>
      {savedLayout ? <ProcessFlow chart={chart} height={640} onEntitySelect={selectTable} selectedEntity={selected} erdLayout={savedLayout} /> :
        <div className="my-4 rounded border border-[var(--bi-border)] p-6 text-[12px] text-[var(--bi-muted)]">
          <p role="status">{layoutError || (focus ? '저장된 배치를 불러오는 중입니다.' : '저장된 배치가 없습니다. 배치를 등록한 뒤 새로고침해 주세요.')}</p>
          {layoutError ? <Button className="mt-3" variant="secondary" onClick={() => setRetry(value => value+1)}>다시 시도</Button> : null}
        </div>}
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
                <td className="px-3 py-1.5"><button className="text-[var(--bi-accent)] underline" onClick={() => selectTable(r.source)}>{r.source}</button> · {r.fields.join(', ')}</td>
                <td className="px-3 py-1.5"><button className="text-[var(--bi-accent)] underline" onClick={() => selectTable(r.target)}>{r.target}</button> · {r.references.join(', ')}</td>
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
      <section className="mt-5">
        <h3 className="mt-0 mb-2 text-[14px] font-semibold">읽는 법</h3>
        <ul className="m-0 list-disc space-y-1.5 pl-5 text-[13px] leading-[1.7]">
          {chart.howToRead?.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </section>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Background, Controls, PanOnScrollMode, ReactFlow, ReactFlowProvider, useNodesState, type Edge, type Node } from '@xyflow/react';
import { Button } from '../erp/button';
import { Dropdown } from '../erp/dropdown';
import { FlowNode } from './flow-node';
import { GroupNode } from './group-node';
import { RouteEdge } from './route-edge';
import { layoutChart } from './layout';
import type { FlowChart, FlowLayout, FlowPort } from './types';

const nodeTypes = { flow: FlowNode, flowGroup: GroupNode };
const edgeTypes = { flowRoute: RouteEdge };
const ports = [{ value: '', label: '자동' }, { value: 'left', label: '왼쪽' }, { value: 'right', label: '오른쪽' }, { value: 'top', label: '위' }, { value: 'bottom', label: '아래' }];

function EditorCanvas({ initialNodes, edges, onNodeDragStop, onEdgeClick, onPaneClick }: {
  initialNodes: Node[]; edges: Edge[]; onNodeDragStop: (node: Node) => void;
  onEdgeClick: (id: string) => void; onPaneClick: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  // 저장 배치나 연결점이 바뀔 때만 전체 노드를 교체한다. 드래그 중에는
  // React Flow의 position 변경만 적용해 Dagre 재계산을 피한다.
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  return <ReactFlowProvider><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
    onNodesChange={onNodesChange} onNodeDragStop={(_, node) => onNodeDragStop(node)}
    onEdgeClick={(_, edge) => onEdgeClick(edge.id)} onPaneClick={onPaneClick}
    panOnScroll panOnScrollMode={PanOnScrollMode.Free} zoomOnScroll={false} zoomOnPinch
    nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} fitView minZoom={0.02} maxZoom={2} zoomOnDoubleClick={false}>
    <Background /><Controls showInteractive={false} />
  </ReactFlow></ReactFlowProvider>;
}

export function LayoutEditor({ chart, projectSlug, onClose, onSaved }: {
  chart: FlowChart; projectSlug: string; onClose: () => void; onSaved: (chart: FlowChart) => void;
}) {
  const [base, setBase] = useState<{ chart: FlowChart; revision: number; categorySlug: string }>();
  const [layout, setLayout] = useState<FlowLayout>({ nodes: {}, edges: {} });
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const url = `/api/flows/${encodeURIComponent(projectSlug)}/${encodeURIComponent(chart.slug)}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: 'no-store', signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error('차트를 불러오지 못했습니다.');
      const row = await res.json(); setBase(row); setLayout(row.chart.layout ?? { nodes: {}, edges: {} });
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [url]);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const unload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', unload);
    return () => { document.body.style.overflow = prev; window.removeEventListener('beforeunload', unload); };
  }, [dirty]);
  const draft = useMemo(() => ({ ...(base?.chart ?? chart), layout }), [base, chart, layout]);
  const rendered = useMemo(() => layoutChart(draft), [draft]);
  function change(next: FlowLayout) { setLayout(next); setDirty(true); }
  function route(patch: FlowLayout['edges'][string]) {
    change({ ...layout, edges: { ...layout.edges, [selected]: { ...layout.edges[selected], ...patch } } });
  }
  const nodes = useMemo(() => rendered.nodes.map(n => ({ ...n, draggable: n.type === 'flow' && !saving, selectable: n.type === 'flow' })), [rendered.nodes, saving]);
  const edges = rendered.edges.map(e => ({ ...e, type: 'flowRoute', selected: e.id === selected,
    data: { ...e.data, waypoints: layout.edges[e.id]?.waypoints, movePoint: (id: string, index: number, point: { x: number; y: number }) => {
      if (saving) return;
      setLayout(current => ({ ...current, edges: { ...current.edges, [id]: { ...current.edges[id], waypoints: current.edges[id]?.waypoints?.map((p, i) => i === index ? point : p) } } })); setDirty(true);
    } },
  }));
  async function save() {
    if (!base) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chart: draft, revision: base.revision }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '저장하지 못했습니다.');
      onSaved(draft); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : '저장 오류'); }
    finally { setSaving(false); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ projectSlug, categorySlug: base?.categorySlug, chart: draft, revision: base?.revision }, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = `${chart.slug}-layout.json`; a.click(); URL.revokeObjectURL(href);
  }
  return createPortal(<div role="dialog" aria-modal="true" aria-label="플로우 배치 편집" className="fixed inset-0 z-[70] flex flex-col bg-[var(--bi-bg)] text-[var(--bi-fg)]">
    <div className="flex flex-wrap items-center gap-3 border-b p-3">
      <strong className="mr-auto text-sm">{chart.title} · 배치 편집</strong>
      <Button size="sm" variant="secondary" disabled={!base || saving} onClick={() => change({ nodes: {}, edges: {} })}>자동 배치로 초기화</Button>
      <Button size="sm" variant="secondary" disabled={!base} onClick={download}>JSON 다운로드</Button>
      <Button size="sm" variant="secondary" disabled={saving} onClick={() => { if (!dirty || window.confirm('저장하지 않은 배치 변경을 취소할까요?')) onClose(); }}>취소</Button>
      <Button size="sm" disabled={!base || saving || !dirty} onClick={save}>{saving ? '저장 중…' : '저장'}</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs">
      <span>노드를 드래그하세요. 선을 선택하면 연결 위치와 경유점을 수정할 수 있습니다.</span>
      {selected && <>
        <span>시작</span><Dropdown ariaLabel="시작 연결 위치" value={layout.edges[selected]?.sourcePort ?? ''} options={ports} disabled={saving} onChange={v => route({ sourcePort: (v || undefined) as FlowPort | undefined })} />
        <span>끝</span><Dropdown ariaLabel="끝 연결 위치" value={layout.edges[selected]?.targetPort ?? ''} options={ports} disabled={saving} onChange={v => route({ targetPort: (v || undefined) as FlowPort | undefined })} />
        <Button size="sm" variant="secondary" disabled={saving || (layout.edges[selected]?.waypoints?.length ?? 0) >= 100} onClick={() => {
          const edge = draft.edges.find(e => e.id === selected)!;
          const from = nodes.find(n => n.id === edge.source)!; const to = nodes.find(n => n.id === edge.target)!;
          const previous = layout.edges[selected]?.waypoints ?? [];
          route({ waypoints: [...previous, { x: (from.position.x + to.position.x) / 2 + 50, y: (from.position.y + to.position.y) / 2 + 40 + previous.length * 25 }] });
        }}>경유점 추가</Button>
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => route({ waypoints: [] })}>경유점 지우기</Button>
        <span>원형 경유점을 드래그해 경로를 조정하세요.</span>
      </>}
    </div>
    {error && <p role="alert" className="px-3 py-2 text-red-600">{error} 변경한 배치는 JSON으로 내려받을 수 있습니다.</p>}
    {!base ? <p className="p-4">{error ? '불러오기 실패' : '최신 차트를 불러오는 중…'}</p> : <div className="min-h-0 flex-1"><EditorCanvas initialNodes={nodes} edges={edges}
      onNodeDragStop={node => { setLayout(current => ({ ...current, nodes: { ...current.nodes, [node.id]: node.position } })); setDirty(true); }}
      onEdgeClick={setSelected} onPaneClick={() => setSelected('')} /></div>}
  </div>, document.body);
}

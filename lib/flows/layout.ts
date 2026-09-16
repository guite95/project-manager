import type { FlowChart, FlowLayout } from '../../components/flow/types.ts';

/** 내용만 수정하는 작성자가 사용자 배치를 지우지 않도록 살아 있는 ID만 보존한다. */
export function preserveFlowLayout(current: FlowChart, next: FlowChart): FlowChart {
  if (next.layout !== undefined || !current.layout) return next;
  const nodes = new Set(next.nodes.map(n => n.id));
  const edges = new Set(next.edges.filter(e => {
    const old = current.edges.find(o => o.id === e.id);
    return old?.source === e.source && old?.target === e.target;
  }).map(e => e.id));
  const layout: FlowLayout = {
    nodes: Object.fromEntries(Object.entries(current.layout.nodes).filter(([id]) => nodes.has(id))),
    edges: Object.fromEntries(Object.entries(current.layout.edges).filter(([id]) => edges.has(id))),
  };
  return { ...next, layout };
}

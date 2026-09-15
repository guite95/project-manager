"use client";

import { Handle, Position } from '@xyflow/react';
import type { FlowRenderData } from './flow-node';
import { ENTITY_HEADER, ENTITY_ROW, ENTITY_FOOTER } from '../../lib/erd/geometry';

export function EntityNode({ data }: { data: FlowRenderData }) {
  const entity = data.entity!;
  return (
    <div style={{ width: data.w, border: '1px solid var(--bi-border)', borderRadius: 3, background: 'var(--bi-card-bg)', color: 'var(--bi-fg)', overflow: 'hidden', boxShadow: data.emphasized ? '0 0 0 3px var(--bi-accent)' : undefined }}>
      {data.erdPorts ? data.erdPorts.map(port => <Handle key={port.id} id={port.id} type={port.type}
        position={port.side === 'left' ? Position.Left : Position.Right} style={{ top: port.top, width: 4, height: 4 }} />) : <>
        <Handle type="target" id="in" position={Position.Left} />
        <Handle type="target" id="self-in" position={Position.Top} style={{ left: '65%' }} />
        <Handle type="source" id="self-out" position={Position.Top} style={{ left: '35%' }} />
        <Handle type="source" id="out" position={Position.Right} />
      </>}
      <div style={{ height: ENTITY_HEADER, padding: '8px 10px', boxSizing: 'border-box', background: entity.external ? 'var(--bi-sidebar-bg)' : 'var(--bi-accent-light)', borderBottom: '1px solid var(--bi-border)' }}>
        <div style={{ fontSize: 10, color: 'var(--bi-muted)' }}>{entity.domain}{entity.external ? ' · 참조' : ''}</div>
        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: '22px', whiteSpace: 'nowrap' }}>{data.label}</div>
      </div>
      {entity.fields.map(field => (
        <div key={field.name} style={{ display: 'flex', gap: 5, alignItems: 'center', height: ENTITY_ROW, padding: '0 9px', fontSize: 10, borderBottom: '1px solid var(--bi-border)' }}>
          <span style={{ width: 47, flexShrink: 0, color: 'var(--bi-accent)', fontWeight: 700, fontSize: 9 }}>{field.keys.join(' ')}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={field.name}>{field.name}</span>
          <span style={{ color: 'var(--bi-muted)', fontSize: 9 }}>{field.type}{field.optional ? '?' : ''}</span>
        </div>
      ))}
      <div style={{ height: ENTITY_FOOTER, padding: '5px 10px', fontSize: 10, boxSizing: 'border-box', color: 'var(--bi-muted)' }}>전체 {entity.fieldCount}개 컬럼 · PK/FK {entity.fields.length}개 표시</div>
    </div>
  );
}

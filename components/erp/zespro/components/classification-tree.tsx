"use client";

import type { ReactNode } from "react";
import { cx } from "../lib/class-names";
import { ChevronIcon } from "./icons";

export type ClassificationTreeNode = {
  id: string;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
  children?: readonly ClassificationTreeNode[];
  disabled?: boolean;
};

export type ClassificationTreeProps = {
  nodes: readonly ClassificationTreeNode[];
  selectedId?: string;
  collapsedIds?: ReadonlySet<string>;
  onSelect?: (node: ClassificationTreeNode) => void;
  onCollapsedChange?: (id: string, collapsed: boolean) => void;
  root?: ClassificationTreeNode;
  className?: string;
  emptyMessage?: ReactNode;
};

function TreeNode({
  node,
  depth,
  selectedId,
  collapsedIds,
  onSelect,
  onCollapsedChange
}: {
  node: ClassificationTreeNode;
  depth: number;
  selectedId?: string;
  collapsedIds: ReadonlySet<string>;
  onSelect?: ClassificationTreeProps["onSelect"];
  onCollapsedChange?: ClassificationTreeProps["onCollapsedChange"];
}) {
  const hasChildren = Boolean(node.children?.length);
  const collapsed = collapsedIds.has(node.id);
  return (
    <li role="treeitem" aria-selected={node.id === selectedId} aria-expanded={hasChildren ? !collapsed : undefined}>
      <div className={cx("pds-tree__item", node.id === selectedId && "is-active", node.disabled && "is-disabled")} style={{ paddingLeft: 8 + depth * 16 }}>
        {hasChildren ? (
          <button
            type="button"
            className="pds-tree__toggle"
            aria-label={collapsed ? `${String(node.label)} 펼치기` : `${String(node.label)} 접기`}
            onClick={() => onCollapsedChange?.(node.id, !collapsed)}
          >
            <ChevronIcon size={13} direction={collapsed ? "right" : "down"} />
          </button>
        ) : <span className="pds-tree__toggle-placeholder" />}
        <button type="button" className="pds-tree__select" disabled={node.disabled} onClick={() => onSelect?.(node)}>
          {node.icon ? <span className="pds-tree__icon">{node.icon}</span> : null}
          <span className="pds-tree__label">{node.label}</span>
          {node.count !== undefined ? <span className="pds-tree__count">{node.count.toLocaleString()}</span> : null}
        </button>
      </div>
      {hasChildren && !collapsed ? (
        <ul role="group">
          {node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              collapsedIds={collapsedIds}
              onSelect={onSelect}
              onCollapsedChange={onCollapsedChange}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ClassificationTree({
  nodes,
  selectedId,
  collapsedIds = new Set<string>(),
  onSelect,
  onCollapsedChange,
  root,
  className,
  emptyMessage = "항목이 없습니다."
}: ClassificationTreeProps) {
  const items = root ? [root, ...nodes] : nodes;
  return (
    <nav className={cx("pds", "pds-tree", className)} aria-label="분류">
      {items.length ? (
        <ul role="tree">
          {items.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              collapsedIds={collapsedIds}
              onSelect={onSelect}
              onCollapsedChange={onCollapsedChange}
            />
          ))}
        </ul>
      ) : <div className="pds-tree__empty">{emptyMessage}</div>}
    </nav>
  );
}

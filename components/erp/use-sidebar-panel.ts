"use client";

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";

type Point = { x: number; y: number };

function headsToPanel(point: Point, from: Point | null, panel: HTMLElement | null) {
  if (!from || !panel) return false;
  const { left, top, bottom } = panel.getBoundingClientRect();
  // 레일을 따라 움직이는 경우와 패널 쪽으로 움직이는 경우를 구분한다.
  if (left <= from.x || point.x < from.x) return false;
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const upper = { x: left, y: top };
  const lower = { x: left, y: bottom };
  const sides = [cross(from, upper, point), cross(upper, lower, point), cross(lower, from, point)];
  return !(sides.some(value => value < 0) && sides.some(value => value > 0));
}

/** 고정 접힘은 호출자가 저장하고, 잠깐 열기와 수동 영역 선택은 이 화면 안에서만 유지한다. */
export function useSidebarPanel<Id extends string | number>({ collapsed, activeId, routeKey, onCollapsedChange, enabled = true }: {
  collapsed: boolean;
  activeId: Id | undefined;
  routeKey?: string;
  onCollapsedChange: (collapsed: boolean) => void;
  enabled?: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const railRefs = useRef(new Map<Id, HTMLElement>());
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aimFrom = useRef<Point | null>(null);
  const hoveredId = useRef<Id | null>(null);
  const hovering = useRef(false);
  const suppressFocus = useRef(false);
  const [peekId, setPeekId] = useState<Id | null>(null);
  const [manual, setManual] = useState<{ id: Id; routeKey?: string } | null>(null);
  if (manual && manual.routeKey !== routeKey) setManual(null);
  const peeking = enabled && collapsed && peekId !== null;
  const shownId = peeking ? peekId : manual?.routeKey === routeKey ? manual?.id ?? activeId : activeId;

  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const cancelSwitch = () => {
    if (switchTimer.current !== null) clearTimeout(switchTimer.current);
    switchTimer.current = null;
  };
  const closePeek = () => {
    cancelClose();
    cancelSwitch();
    aimFrom.current = null;
    setPeekId(null);
  };
  const openPeek = (id: Id) => {
    if (!enabled || !collapsed) return;
    cancelClose();
    cancelSwitch();
    aimFrom.current = null;
    setPeekId(id);
  };
  useEffect(() => {
    closePeek();
    // 공유 설정 변경·모바일 전환 때 이전의 임시 메뉴를 다시 띄우지 않는다.
  }, [collapsed, enabled]);
  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    if (switchTimer.current !== null) clearTimeout(switchTimer.current);
  }, []);

  const focusRail = (id: Id | undefined | null) => {
    if (id == null) return;
    suppressFocus.current = true;
    railRefs.current.get(id)?.focus();
    suppressFocus.current = false;
  };
  const hoverRail = (id: Id, event: MouseEvent<HTMLElement>) => {
    hoveredId.current = id;
    if (!enabled || !collapsed) return;
    cancelClose();
    if (peekId === id) { cancelSwitch(); return; }
    if (peekId === null || !headsToPanel({ x: event.clientX, y: event.clientY }, aimFrom.current, panelRef.current)) {
      openPeek(id);
      return;
    }
    // 대각선으로 패널에 들어가는 동안 스친 다른 메뉴는 150ms 머문 뒤 전환한다.
    cancelSwitch();
    switchTimer.current = setTimeout(() => {
      switchTimer.current = null;
      if (hoveredId.current === id) openPeek(id);
    }, 150);
  };

  return {
    panelRef,
    peeking,
    shownId,
    togglePanel: () => {
      if (peeking && peekId !== null) setManual({ id: peekId, routeKey });
      if (!collapsed) focusRail(shownId);
      closePeek();
      onCollapsedChange(!collapsed);
    },
    rootProps: {
      onMouseEnter: () => { hovering.current = true; cancelClose(); },
      onMouseLeave: () => {
        hovering.current = false;
        cancelSwitch();
        if (!peeking) return;
        cancelClose();
        closeTimer.current = setTimeout(closePeek, 150);
      },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (hovering.current || (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) return;
        closePeek();
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Escape" || !peeking) return;
        event.preventDefault();
        closePeek();
        if (panelRef.current?.contains(document.activeElement)) focusRail(peekId);
      },
    },
    railProps: (id: Id) => ({
      ref: (element: HTMLElement | null) => {
        if (element) railRefs.current.set(id, element);
        else railRefs.current.delete(id);
      },
      onMouseEnter: (event: MouseEvent<HTMLElement>) => hoverRail(id, event),
      onMouseMove: (event: MouseEvent<HTMLElement>) => hoverRail(id, event),
      onMouseLeave: (event: MouseEvent<HTMLElement>) => {
        if (hoveredId.current === id) hoveredId.current = null;
        cancelSwitch();
        if (peekId === id) aimFrom.current = { x: event.clientX, y: event.clientY };
      },
      onFocus: () => { if (!suppressFocus.current) openPeek(id); },
      onClick: () => {
        setManual({ id, routeKey });
        openPeek(id);
      },
    }),
  };
}

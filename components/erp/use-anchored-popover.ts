"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type PopoverPosition = { left: number; top: number };

/**
 * 트리거 기준으로 fixed 팝오버 좌표를 계산한다.
 *
 * 좌우는 뷰포트 안(최소 8px 여백)으로 클램프하고, 아래 공간이 모자라면
 * 트리거 위로 뒤집는다. resize 와 (capture 단계) scroll 에서 다시 계산한다.
 */
export function useAnchoredPopover<T extends HTMLElement>(
  open: boolean,
  width: number,
) {
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const positioned = position !== null;

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const update = () => {
      const triggerRect = trigger.getBoundingClientRect();
      const panelWidth = panelRef.current?.offsetWidth ?? width;
      const panelHeight = panelRef.current?.offsetHeight ?? 360;
      const left = Math.min(
        Math.max(8, triggerRect.left),
        Math.max(8, window.innerWidth - panelWidth - 8),
      );
      const belowTop = triggerRect.bottom + 4;
      const top =
        belowTop + panelHeight <= window.innerHeight - 8
          ? belowTop
          : Math.max(8, triggerRect.top - panelHeight - 4);
      setPosition({ left, top });
    };

    update();
    // 첫 좌표가 생긴 다음 패널이 mount된다. 실제 높이로 재배치하고 크기 변경도 반영한다.
    const panel = panelRef.current;
    const observer = new ResizeObserver(update);
    if (panel) observer.observe(panel);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, width, positioned]);

  return { triggerRef, panelRef, position };
}

/**
 * 팝오버 바깥 클릭과 Escape 로 닫는다.
 *
 * `data-erp-popover` 가 붙은 요소 안의 클릭은 무시한다. DatePicker·DateRangeFilter 는
 * 팝오버를 body 로 포털하므로, 그 안을 클릭하면 이 팝오버를 감싼 부모 팝오버에게는
 * DOM 상 "바깥"으로 보인다. 표식이 없으면 필터 패널 안에서 날짜를 고르는 순간
 * 패널이 닫힌다.
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  refs: Array<{ current: HTMLElement | null }>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      if (
        target instanceof Element &&
        target.closest("[data-erp-popover]") !== null
      ) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
    // refs 는 안정적인 ref 객체라 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}

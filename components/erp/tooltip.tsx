"use client";

import {
  cloneElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import {
  calculateTooltipPosition,
  type TooltipRect,
} from "@/lib/tooltip-position";

type TooltipChildProps = {
  "aria-describedby"?: string;
};

type TooltipProps = {
  children: ReactElement<TooltipChildProps>;
  content: string;
  className?: string;
};

/** 목록의 말줄임 텍스트를 hover와 키보드 focus에서 온전히 보여준다. */
export function Tooltip({ children, content, className = "" }: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const open = hovered || focused;

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const triggerRect = trigger.getBoundingClientRect();
      const rect: TooltipRect = {
        left: triggerRect.left,
        right: triggerRect.right,
        top: triggerRect.top,
        bottom: triggerRect.bottom,
      };
      setPosition(
        calculateTooltipPosition(
          rect,
          { width: panel.offsetWidth, height: panel.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };

    update();
    const observer = new ResizeObserver(update);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [content, open]);

  const existingDescription = children.props["aria-describedby"];
  const describedBy = existingDescription
    ? `${existingDescription} ${tooltipId}`
    : tooltipId;

  return (
    <>
      <span
        className={`flex min-w-0 ${className}`}
        onBlurCapture={() => setFocused(false)}
        onFocusCapture={() => setFocused(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        ref={triggerRef}
      >
        {cloneElement(children, { "aria-describedby": describedBy })}
      </span>
      {open
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[100] max-w-[min(360px,calc(100vw-16px))] whitespace-normal break-words rounded-[4px] border border-[#d4d4d4] bg-white px-3 py-2 text-[14px] leading-[1.5] font-normal text-black shadow-[0_4px_14px_rgba(0,0,0,0.16)]"
              id={tooltipId}
              ref={panelRef}
              role="tooltip"
              style={{
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                visibility: position ? "visible" : "hidden",
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

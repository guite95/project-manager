"use client";

import { useState } from "react";
import { getNodesBounds, useReactFlow } from "@xyflow/react";
import { toSvg } from "html-to-image";
import { HiOutlineDownload } from "react-icons/hi";

/* -------------------------------------------------------------------------
 * 차트 전체를 SVG 파일로 저장.
 *
 * 노드가 HTML 카드라 순수 SVG 직렬화는 불가능하다 — React Flow 공식 권장대로
 * html-to-image 로 `.react-flow__viewport` 를 찍는다. 현재 줌과 무관하게 노드
 * 바운즈 기준 scale(1) 로 캡처하므로 결과물은 항상 전체 차트다.
 * ---------------------------------------------------------------------- */

const PAD = 40;

export function ExportSvgButton({
  slug,
  wrapper,
}: {
  slug: string;
  /** `.react-flow__viewport` 를 포함하는 캔버스 래퍼 (모달 쪽 캔버스와 구분용) */
  wrapper: React.RefObject<HTMLDivElement | null>;
}) {
  const { getNodes } = useReactFlow();
  const [failed, setFailed] = useState(false);

  const onExport = async () => {
    try {
      setFailed(false);
      const viewport = wrapper.current?.querySelector<HTMLElement>(
        ".react-flow__viewport"
      );
      if (!viewport) throw new Error("viewport not found");
      const bounds = getNodesBounds(getNodes());
      const width = Math.ceil(bounds.width) + PAD * 2;
      const height = Math.ceil(bounds.height) + PAD * 2;
      const bg =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--bi-bg")
          .trim() || "#ffffff";
      const dataUrl = await toSvg(viewport, {
        width,
        height,
        backgroundColor: bg,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${PAD - bounds.x}px, ${PAD - bounds.y}px) scale(1)`,
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${slug}.svg`;
      a.click();
    } catch {
      setFailed(true);
    }
  };

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {failed ? (
        <span className="text-[10px] text-[var(--bi-error)]">저장 실패</span>
      ) : null}
      <button
        type="button"
        onClick={onExport}
        className="flex items-center gap-1 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-0.5 text-[11px] text-[var(--bi-fg)] transition hover:border-[var(--bi-accent)] hover:text-[var(--bi-accent)]"
        aria-label="SVG 로 저장"
      >
        <HiOutlineDownload size={11} />
        SVG 저장
      </button>
    </span>
  );
}

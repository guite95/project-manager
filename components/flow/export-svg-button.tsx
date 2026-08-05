"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { toSvg } from "html-to-image";
import { HiOutlineDownload } from "react-icons/hi";

/* -------------------------------------------------------------------------
 * 차트 전체를 SVG 파일로 저장.
 *
 * 노드가 HTML 카드라 순수 SVG 직렬화는 불가능하다 — React Flow 공식 권장대로
 * html-to-image 로 `.react-flow__viewport` 를 찍는다. 현재 줌과 무관하게 노드
 * 바운즈 기준 scale(1) 로 캡처하므로 결과물은 항상 전체 차트다.
 *
 * `getNodesBounds` 는 반드시 `useReactFlow()` 가 주는 것을 쓴다. 같은 이름의
 * standalone export 는 그룹 자식 노드의 부모 오프셋을 모르는 탓에 바운즈가
 * 작게 나오고, 그룹이 있는 차트가 오른쪽·아래로 잘려 저장된다.
 * ---------------------------------------------------------------------- */

const PAD = 40;

/** revoke 를 click 직후에 하면 브라우저가 다운로드를 취소하는 경우가 있다. */
const REVOKE_DELAY_MS = 60_000;

export function ExportSvgButton({
  slug,
  wrapper,
}: {
  slug: string;
  /** `.react-flow__viewport` 를 포함하는 캔버스 래퍼 (모달 쪽 캔버스와 구분용) */
  wrapper: React.RefObject<HTMLDivElement | null>;
}) {
  const { getNodes, getNodesBounds } = useReactFlow();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onExport = async () => {
    // 큰 차트는 직렬화가 수 초 걸린다. 그동안 눌러도 중복 실행하지 않는다.
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const viewport = wrapper.current?.querySelector<HTMLElement>(
        ".react-flow__viewport"
      );
      if (!viewport) throw new Error("react-flow viewport 를 찾지 못했다");
      const nodes = getNodes();
      if (!nodes.length) throw new Error("내보낼 노드가 없다");

      const bounds = getNodesBounds(nodes);
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

      // toSvg 는 data: URL 을 준다. 큰 차트는 수 MB 라 data: URL 다운로드
      // 한계에 걸릴 수 있어서 Blob 으로 바꿔 내려받는다.
      const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
      const url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.svg`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    } catch (e) {
      console.error("SVG 저장 실패", e);
      setFailed(true);
    } finally {
      setBusy(false);
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
        disabled={busy}
        className="flex items-center gap-1 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-0.5 text-[11px] text-[var(--bi-fg)] transition hover:border-[var(--bi-accent)] hover:text-[var(--bi-accent)] disabled:opacity-50"
        aria-label="SVG 로 저장"
      >
        <HiOutlineDownload size={11} />
        {busy ? "저장 중…" : "SVG 저장"}
      </button>
    </span>
  );
}

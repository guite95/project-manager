/* -------------------------------------------------------------------------
 * `**강조**` 마크업만 지원하는 초소형 리치텍스트.
 * 데이터 파일(.ts)에 JSX 를 넣지 않기 위한 장치다 — 다른 문법은 지원하지 않는다.
 * ---------------------------------------------------------------------- */

export function RichText({ text }: { text: string }) {
  // "a **b** c".split(/\*\*(.+?)\*\*/g) → ["a ", "b", " c"] — 홀수 인덱스가 강조.
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-[var(--bi-fg)]">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

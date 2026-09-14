import { LoadingSkeleton } from "./loading-skeleton";

const ROWS = Array.from({ length: 7 }, (_, index) => index);
const HEADER_WIDTHS = ["w-28", "w-20", "w-16", "w-12"] as const;
const CELL_WIDTHS = ["w-36", "w-24", "w-16", "w-12"] as const;

export function PageLoading({
  label = "화면을 불러오는 중",
}: {
  label?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="min-h-full bg-[var(--bi-bg)]"
      role="status"
    >
      <span className="sr-only">{label}</span>

      <header className="flex h-[69px] items-center border-b border-[var(--bi-border)] px-6">
        <LoadingSkeleton className="h-4 w-40" />
      </header>

      <div className="flex h-[55px] items-center justify-between border-b border-[var(--bi-border)] px-6">
        <LoadingSkeleton className="h-[30px] w-52" />
        <LoadingSkeleton className="h-[30px] w-20" />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid h-[40px] grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_120px_96px] items-center border-b border-[var(--bi-border)] bg-[var(--bi-table-header)] px-3">
            {HEADER_WIDTHS.map((width) => (
              <LoadingSkeleton className={`h-2.5 ${width}`} key={width} />
            ))}
          </div>

          {ROWS.map((row) => (
            <div
              className="grid h-[42px] grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_120px_96px] items-center border-b border-[var(--bi-border)] px-3"
              key={row}
            >
              {CELL_WIDTHS.map((width, column) => (
                <LoadingSkeleton
                  className={`h-2.5 ${width} ${row % 2 === 1 && column === 0 ? "max-w-[75%]" : ""}`}
                  key={`${row}-${column}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { DetailSection } from "@/components/erp/detail-section";
import { LoadingIndicator } from "@/components/erp/loading-indicator";
import { LoadingSkeleton } from "@/components/erp/loading-skeleton";
import { PageLoading } from "@/components/erp/page-loading";

const SIZES = ["sm", "md", "lg"] as const;

export function LoadingSection() {
  return (
    <DetailSection title="11. 로딩 상태">
      <div className="grid grid-cols-1 border-b border-[var(--bi-border)] sm:grid-cols-3">
        {SIZES.map((size) => (
          <div
            className="flex min-h-[96px] items-center justify-center border-b border-[var(--bi-border)] px-6 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
            key={size}
          >
            <LoadingIndicator
              announce={false}
              label={`${size} 로딩`}
              size={size}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 border-b border-[var(--bi-border)] sm:grid-cols-2">
        <div className="flex min-h-[96px] items-center justify-center border-b border-[var(--bi-border)] px-6 py-5 sm:border-b-0 sm:border-r">
          <LoadingIndicator
            announce={false}
            label="아이콘 전용 로딩"
            showLabel={false}
            size="md"
          />
        </div>
        <div className="flex min-h-[96px] flex-col justify-center px-6 py-5">
          <LoadingSkeleton className="h-3 w-40" />
          <LoadingSkeleton className="mt-2 h-2.5 w-64 max-w-full" />
        </div>
      </div>

      <div className="flex min-h-[96px] items-center justify-center border-b border-[var(--bi-border)] px-6 py-5">
        <LoadingIndicator
          announce={false}
          label="데이터를 불러오는 중…"
          size="md"
        />
      </div>

      <div aria-hidden="true" className="h-[482px] overflow-hidden">
        <PageLoading label="페이지 스켈레톤 미리보기" />
      </div>
    </DetailSection>
  );
}

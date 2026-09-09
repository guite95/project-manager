import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { TodayBoardView } from "@/components/today-board/today-board";

export const metadata: Metadata = {
  title: "오늘의 할 일 — 프로젝트 매니지먼트",
  description: "프로젝트별로 쌓인 이슈를 오늘 할 일로 옮겨 체크합니다.",
};

export default function TodayPage() {
  return (
    // lg 이상에서는 뷰포트 높이를 채워 두 칼럼이 각자 스크롤한다. 좁은 화면에서는
    // 칼럼이 세로로 쌓이므로 지금처럼 페이지 전체가 스크롤되게 둔다.
    <div className="mx-auto flex max-w-[1200px] flex-col lg:h-full">
      <div className="shrink-0">
        <PageHeader
          description="프로젝트별로 쌓인 이슈를 오늘 할 일로 옮겨 체크합니다. 내용은 서버에 저장되어 어느 브라우저에서나 같습니다."
          title="오늘의 할 일"
        />
        <div className="px-6 pt-3">
          <Link
            className="text-[12px] text-[var(--bi-muted)] hover:text-[var(--bi-fg)] hover:underline"
            href="/today/history"
          >
            완료 이력 보기 →
          </Link>
        </div>
      </div>
      <TodayBoardView />
    </div>
  );
}

import { listFlowProjectNames } from "@/lib/server/flows-store";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { buttonClassName } from "@/components/erp/button-styles";
import { TodayBoardView } from "@/components/today-board/today-board";
import { requireTaskAccess } from '@/lib/access/http';

export const metadata: Metadata = {
  title: "할 일 — 프로젝트 매니지먼트",
  description: "프로젝트별 할 일과 시작일·마감일을 목록과 간트차트로 관리합니다.",
};

export default async function TodayPage() {
  const access = await requireTaskAccess();
  return (
    // lg 이상에서는 뷰포트 높이를 채워 두 칼럼이 각자 스크롤한다. 좁은 화면에서는
    // 칼럼이 세로로 쌓이므로 지금처럼 페이지 전체가 스크롤되게 둔다.
    <div className="flex min-w-0 w-full flex-col lg:h-full">
      <div className="shrink-0">
        <PageHeader
          description="프로젝트별 할 일을 체크하고, 간트차트에서 시작일과 마감일을 관리하세요."
          title="할 일"
          actions={<Link className={buttonClassName({ variant: "secondary" })} href="/today/history">완료 이력 보기</Link>}
        />
      </div>
      <TodayBoardView flowProjects={await listFlowProjectNames(access)} showPersonalIssues={access.hiddenProjectSlugs.length === 0} />
    </div>
  );
}

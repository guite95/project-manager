import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import { TodayBoardView } from "@/components/today-board/today-board";

export const metadata: Metadata = {
  title: "오늘의 할 일 — 프로젝트 매니지먼트",
  description: "프로젝트별로 쌓인 이슈를 오늘 할 일로 옮겨 체크합니다.",
};

export default function TodayPage() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        description="프로젝트별로 쌓인 이슈를 오늘 할 일로 옮겨 체크합니다. 내용은 이 브라우저에 자동 저장됩니다."
        title="오늘의 할 일"
      />
      <TodayBoardView />
    </div>
  );
}

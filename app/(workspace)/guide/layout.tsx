import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "플로우 작성 도구 — 프로젝트 매니지먼트",
  description: "범용 화면·로직 플로우 작성 스킬, CLI와 배치 편집 안내",
};

export default function GuideLayout({ children }: { children: ReactNode }) {
  return <article className="min-w-0 w-full px-8 py-8">{children}</article>;
}

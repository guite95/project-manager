import type { Metadata } from "next";
import { Suspense } from "react";
import { AiOpsDashboard } from "@/components/ai-ops/dashboard";
export const metadata: Metadata = { title: "AI 활동 — AI 관리" };
export default function ActivityPage() {
  return <Suspense fallback={<p role="status" className="p-6">AI 활동을 불러오는 중…</p>}><AiOpsDashboard view="activity" /></Suspense>;
}

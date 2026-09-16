import type { Metadata } from "next";
import { Suspense } from "react";
import { AiOpsDashboard } from "@/components/ai-ops/dashboard";
export const metadata: Metadata = { title: "AI 사용량 — AI 관리" };
export default function UsagePage() {
  return <Suspense fallback={<p role="status" className="p-6">사용량을 불러오는 중…</p>}><AiOpsDashboard view="usage" /></Suspense>;
}

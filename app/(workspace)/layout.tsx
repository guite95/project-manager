import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

/** 세 영역이 같은 셸을 유지하고 본문 라우트만 전환한다. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

export const dynamic = "force-dynamic";

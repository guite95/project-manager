import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ConfirmDialogProvider } from "@/components/erp/confirm-dialog";

/** 모든 업무 영역이 같은 셸을 유지하고 본문 라우트만 전환한다. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <ConfirmDialogProvider><AppShell>{children}</AppShell></ConfirmDialogProvider>;
}

export const dynamic = "force-dynamic";

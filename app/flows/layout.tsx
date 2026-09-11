import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

export default function FlowsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <article className="mx-auto max-w-[760px] px-8 py-8">{children}</article>
    </AppShell>
  );
}

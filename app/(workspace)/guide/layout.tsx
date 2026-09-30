import type { ReactNode } from "react";

export default function GuideLayout({ children }: { children: ReactNode }) {
  return <article className="min-w-0 w-full px-8 py-8">{children}</article>;
}

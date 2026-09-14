import type { ReactNode } from "react";

export default function GuideLayout({ children }: { children: ReactNode }) {
  return <article className="mx-auto max-w-[760px] px-8 py-8">{children}</article>;
}

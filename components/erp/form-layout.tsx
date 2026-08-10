import type { ReactNode } from "react";
import { cn } from "./cn";

export function FormGrid({
  columns = 2,
  children,
}: {
  columns?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
      )}
    >
      {children}
    </div>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>;
}

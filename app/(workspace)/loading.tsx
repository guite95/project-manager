export default function WorkspaceLoading() {
  return (
    <div role="status" className="mx-auto max-w-[1200px] px-6 py-8">
      <span className="text-[12px] text-[var(--bi-muted)]">화면을 불러오는 중입니다…</span>
      <div aria-hidden className="mt-5 space-y-4 motion-safe:animate-pulse">
        <div className="h-6 w-48 rounded bg-[var(--bi-sidebar-active)]" />
        <div className="h-4 w-3/4 rounded bg-[var(--bi-sidebar-bg)]" />
        <div className="h-60 rounded border border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)]" />
      </div>
    </div>
  );
}

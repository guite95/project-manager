export function EmptyState({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <tr>
      <td
        className="border-b border-[var(--bi-border)] bg-[var(--bi-surface-subtle)] px-4 py-12 text-center text-[13px] leading-relaxed text-[var(--bi-muted)]"
        colSpan={colSpan}
      >
        {message}
      </td>
    </tr>
  );
}

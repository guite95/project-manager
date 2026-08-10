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
        className="border-b border-[var(--bi-border)] px-4 py-10 text-center text-[12px] text-[var(--bi-muted)]"
        colSpan={colSpan}
      >
        {message}
      </td>
    </tr>
  );
}

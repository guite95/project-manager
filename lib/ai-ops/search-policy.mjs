// Exact standalone Claude notices only; quoted notices in real prose remain searchable.
const interruptionNotices = [
  "[request interrupted by user]",
  "[request interrupted by user for tool use]",
];
export function isInterruptionNotice(content = "") {
  return interruptionNotices.includes(content.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").toLowerCase());
}

// Only internal, fixed SQL columns are passed here. Filter before LIMIT/cursor paging.
export function searchableMessageSql(column) {
  if (!["m.body", "d.content"].includes(column)) throw new Error("Invalid search column");
  return `lower(btrim(coalesce(${column},''), E' \\t\\r\\n')) NOT IN (${interruptionNotices.map((value) => `'${value}'`).join(",")})`;
}

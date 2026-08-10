export type TableColumnDefinition = {
  key: string;
  label: string;
  defaultVisible: boolean;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
};

export type TablePreferences = {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function normalizeTablePreferences(
  columns: TableColumnDefinition[],
  stored: unknown
): TablePreferences {
  const validKeys = new Set(columns.map((column) => column.key));
  const record = isRecord(stored) ? stored : undefined;

  const savedOrder = Array.isArray(record?.order)
    ? record.order.filter(
        (key): key is string => typeof key === "string" && validKeys.has(key)
      )
    : [];
  const order = [
    ...new Set(savedOrder),
    ...columns.map((column) => column.key).filter((key) => !savedOrder.includes(key)),
  ];

  const hidden = Array.isArray(record?.hidden)
    ? [...new Set(record.hidden)].filter(
        (key): key is string => typeof key === "string" && validKeys.has(key)
      )
    : columns
        .filter((column) => !column.defaultVisible)
        .map((column) => column.key);
  if (columns.length > 0 && hidden.length === columns.length) {
    const firstOrderedKey = order[0];
    hidden.splice(hidden.indexOf(firstOrderedKey), 1);
  }

  const savedWidths = isRecord(record?.widths) ? record.widths : {};
  const widths = Object.fromEntries(
    columns.map((column) => {
      const candidate = savedWidths[column.key];
      const width =
        typeof candidate === "number" && Number.isFinite(candidate)
          ? candidate
          : column.defaultWidth;
      return [
        column.key,
        clamp(width, column.minWidth ?? 60, column.maxWidth ?? 600),
      ];
    })
  );

  return { order, hidden, widths };
}

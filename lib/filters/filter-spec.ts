/**
 * 목록 필터 패널의 선언 스펙과 파생 로직.
 *
 * 화면은 필터를 스펙 배열 하나로 선언하고, 패널 폼·칩·배지 개수·전체 해제가
 * 모두 이 스펙에서 파생된다. 화면과 컴포넌트가 같은 목록을 따로 들고 있다가
 * 한쪽만 갱신되는 일을 막기 위한 단일 출처다.
 *
 * React 에 의존하지 않아 node --test 로 검증한다.
 */

export type FilterOption = { value: string; label: string };

export type FilterFieldSpec<K extends string> =
  | {
      kind: "select";
      key: K;
      label: string;
      options: FilterOption[];
      searchable?: boolean;
      searchPlaceholder?: string;
      disabled?: boolean;
      /** 비활성 사유. 색상만으로 상태를 전달하지 않기 위해 글로 표시한다. 예: "거래처 먼저" */
      disabledHint?: string;
      span?: 1 | 2 | 3;
    }
  | {
      kind: "text";
      key: K;
      label: string;
      placeholder?: string;
      span?: 1 | 2 | 3;
    }
  | {
      kind: "dateRange";
      fromKey: K;
      toKey: K;
      label: string;
      span?: 1 | 2 | 3;
    };

export type FilterGroupSpec<K extends string> = {
  /** 생략하면 그룹 헤더를 그리지 않는다(필터가 적은 화면). */
  title?: string;
  /** 기본 3. 값이 긴 기간 그룹만 2로 낮춘다. */
  columns?: 2 | 3;
  fields: FilterFieldSpec<K>[];
};

export type FilterValues<K extends string> = Record<K, string>;

export type FilterChip<K extends string> = {
  /** 렌더 key 이자 칩의 안정적인 식별자. */
  id: K;
  label: string;
  valueLabel: string;
  /** 이 칩을 지울 때 "" 로 만들 값 key 들. dateRange 는 두 개다. */
  clears: K[];
};

/** 필드의 안정적인 식별자. dateRange 는 시작 key 를 쓴다. */
export function fieldId<K extends string>(field: FilterFieldSpec<K>): K {
  return field.kind === "dateRange" ? field.fromKey : field.key;
}

/** 필드가 차지하는 값 key 목록. */
export function fieldKeys<K extends string>(field: FilterFieldSpec<K>): K[] {
  return field.kind === "dateRange" ? [field.fromKey, field.toKey] : [field.key];
}

/** 스펙에 선언된 모든 값 key. 선언 순서를 유지한다. */
export function allFilterKeys<K extends string>(
  groups: FilterGroupSpec<K>[],
): K[] {
  return groups.flatMap((group) => group.fields.flatMap(fieldKeys));
}

const selectLabel = (options: FilterOption[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

/**
 * 값이 채워진 필드를 칩으로 만든다.
 * dateRange 는 시작·종료 중 하나만 있어도 칩 하나로 센다.
 */
export function activeFilterChips<K extends string>(
  groups: FilterGroupSpec<K>[],
  values: FilterValues<K>,
): FilterChip<K>[] {
  return groups.flatMap((group) =>
    group.fields.flatMap((field): FilterChip<K>[] => {
      if (field.kind === "dateRange") {
        const from = values[field.fromKey] ?? "";
        const to = values[field.toKey] ?? "";
        if (!from && !to) return [];
        return [
          {
            id: field.fromKey,
            label: field.label,
            valueLabel: `${from} ~ ${to}`.trim(),
            clears: [field.fromKey, field.toKey],
          },
        ];
      }
      const value = values[field.key] ?? "";
      if (!value) return [];
      return [
        {
          id: field.key,
          label: field.label,
          valueLabel:
            field.kind === "select" ? selectLabel(field.options, value) : value,
          clears: [field.key],
        },
      ];
    }),
  );
}

/** 트리거 배지에 표시할 적용 개수. */
export function countActiveFilters<K extends string>(
  groups: FilterGroupSpec<K>[],
  values: FilterValues<K>,
): number {
  return activeFilterChips(groups, values).length;
}

/** 주어진 key 들을 "" 로 만든 새 값. */
export function clearFilterKeys<K extends string>(
  values: FilterValues<K>,
  keys: K[],
): FilterValues<K> {
  const next = { ...values };
  for (const key of keys) next[key] = "";
  return next;
}

/** 스펙에 선언된 필터만 비운다. 스펙에 없는 key(q 등)는 그대로 둔다. */
export function clearAllFilters<K extends string>(
  groups: FilterGroupSpec<K>[],
  values: FilterValues<K>,
): FilterValues<K> {
  return clearFilterKeys(values, allFilterKeys(groups));
}

/**
 * 그룹 열 수 → CSS grid-template-columns.
 * auto-fit 이라 패널이 좁아지면 3 → 2 → 1 열로 알아서 접힌다.
 */
export function gridTemplate(columns: 2 | 3 = 3): string {
  return columns === 2
    ? "repeat(auto-fit, minmax(240px, 1fr))"
    : "repeat(auto-fit, minmax(160px, 1fr))";
}

/** span 이 열 수를 넘으면 열 수로 자른다. 넘치면 격자가 깨진다. */
export function clampSpan(
  span: 1 | 2 | 3 | undefined,
  columns: 2 | 3 = 3,
): number {
  return Math.min(span ?? 1, columns);
}

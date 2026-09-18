import { isPersonalProject } from "./personal-projects.ts";

export type UiPreferenceScope = "navigation" | "reference-columns" | "personal-project-groups";
export type UiPreferenceValues = Record<string, boolean | number | string | string[]>;
export type UiPreferences = { exists: boolean; values: UiPreferenceValues };

export class UiPreferenceError extends Error {}

export function isUiPreferenceScope(value: string): value is UiPreferenceScope {
  return value === "navigation" || value === "reference-columns" || value === "personal-project-groups";
}

export function parseUiPreferenceChanges(scope: string, input: unknown): UiPreferenceValues {
  if (!isUiPreferenceScope(scope) || !input || typeof input !== "object" || Array.isArray(input)) {
    throw new UiPreferenceError("설정 형식이 올바르지 않습니다.");
  }
  const entries = Object.entries(input);
  if (!entries.length || entries.length > 200) throw new UiPreferenceError("변경할 설정을 확인해 주세요.");
  const identifier = /^[a-zA-Z0-9_-]{1,100}$/;
  for (const [key, value] of entries) {
    const valid = scope === "personal-project-groups"
      ? isPersonalProject(key) && (value === "portfolio" || value === "toy")
      : scope === "navigation"
      ? (key === "panelCollapsed" || (key.startsWith("project:") && identifier.test(key.slice(8)))) && typeof value === "boolean"
      : ((key === "order" || key === "hidden") && Array.isArray(value) && value.length <= 100 &&
          value.every(item => typeof item === "string" && identifier.test(item)) && new Set(value).size === value.length) ||
        (key.startsWith("width:") && identifier.test(key.slice(6)) && typeof value === "number" && Number.isFinite(value) && value >= 40 && value <= 2000);
    if (!valid) throw new UiPreferenceError("지원하지 않는 설정이거나 값이 올바르지 않습니다.");
  }
  return Object.fromEntries(entries) as UiPreferenceValues;
}

/** 예전 브라우저 설정은 공유 설정이 아직 없을 때만 최초 이관한다. */
export const legacyNavigationPreferences = {
  key: "flows-sidebar-collapsed-v2",
  read(value: unknown): UiPreferenceValues {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
      .filter(([key, collapsed]) => /^p:[a-zA-Z0-9_-]{1,100}$/.test(key) && typeof collapsed === "boolean")
      .map(([key, collapsed]) => [`project:${key.slice(2)}`, collapsed])) as UiPreferenceValues;
  },
};

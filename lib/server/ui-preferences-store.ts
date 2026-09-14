import { Prisma } from "@prisma/client";
import { prisma } from "../db.ts";
import { isUiPreferenceScope, parseUiPreferenceChanges, UiPreferenceError, type UiPreferences } from "../ui-preferences.ts";

function settingKey(scope: string) {
  if (!isUiPreferenceScope(scope)) throw new UiPreferenceError("지원하지 않는 설정입니다.");
  return `ui:${scope}`;
}

function snapshot(value: Prisma.JsonValue | undefined): UiPreferences {
  return { exists: value !== undefined, values: (value ?? {}) as UiPreferences["values"] };
}

export async function loadUiPreferences(scope: string): Promise<UiPreferences> {
  const row = await prisma.appSetting.findUnique({ where: { key: settingKey(scope) } });
  return snapshot(row?.value);
}

export async function saveUiPreferences(scope: string, input: unknown, onlyIfMissing = false): Promise<UiPreferences> {
  const key = settingKey(scope);
  const changes = parseUiPreferenceChanges(scope, input);
  // Compare-and-swap: 다른 브라우저가 갱신하면 최신 값에 이 요청의 변경분만 다시 병합한다.
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await prisma.appSetting.findUnique({ where: { key } });
    if (current && onlyIfMissing) return snapshot(current.value);
    const values = { ...snapshot(current?.value).values, ...changes };
    if (!current) {
      try {
        await prisma.appSetting.create({ data: { key, value: values } });
        return { exists: true, values };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
    const result = await prisma.appSetting.updateMany({
      where: { key, value: { equals: current.value === null ? Prisma.JsonNull : current.value } },
      data: { value: values },
    });
    if (result.count === 1) return { exists: true, values };
  }
  throw new Error("다른 화면에서 설정을 변경 중입니다. 다시 시도해 주세요.");
}

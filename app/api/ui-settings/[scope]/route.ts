import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api-types";
import { UiPreferenceError } from "@/lib/ui-preferences";
import { loadUiPreferences, saveUiPreferences } from "@/lib/server/ui-preferences-store";

type Context = { params: Promise<{ scope: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    return NextResponse.json(await loadUiPreferences((await context.params).scope), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error instanceof UiPreferenceError ? error.message : "설정을 불러오지 못했습니다.", error instanceof UiPreferenceError ? 400 : 500);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const body = await readJson(request);
    if (body.onlyIfMissing !== undefined && typeof body.onlyIfMissing !== "boolean") {
      return jsonError("최초 이관 옵션이 올바르지 않습니다.", 400);
    }
    return NextResponse.json(await saveUiPreferences((await context.params).scope, body.changes, body.onlyIfMissing === true));
  } catch (error) {
    return jsonError(error instanceof UiPreferenceError ? error.message : "설정을 저장하지 못했습니다. 다시 시도해 주세요.", error instanceof UiPreferenceError ? 400 : 500);
  }
}

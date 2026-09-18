"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUiPreferences, patchUiPreferences } from "@/lib/api-client";
import type { UiPreferenceScope, UiPreferenceValues, UiPreferences } from "@/lib/ui-preferences";

type LegacyPreferences = { key: string; read: (value: unknown) => UiPreferenceValues };

/** 변경분만 순서대로 저장한다. 새로고침·창 복귀·15초 간격 조회로 공유 설정을 반영한다. */
export function useSharedPreferences(
  scope: UiPreferenceScope,
  initial?: UiPreferences,
  legacy?: LegacyPreferences,
  options?: { readOnly?: boolean },
) {
  const readOnly = options?.readOnly === true;
  const [values, setValues] = useState<UiPreferenceValues>(initial?.values ?? {});
  const [ready, setReady] = useState(readOnly);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const confirmed = useRef(initial?.values ?? {});
  const pending = useRef<UiPreferenceValues>({});
  const inFlight = useRef(false);
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  const flush = useCallback(async () => {
    if (readOnly || inFlight.current || !Object.keys(pending.current).length) return;
    inFlight.current = true;
    if (mounted.current) { setSaving(true); setError(""); }
    try {
      while (Object.keys(pending.current).length) {
        const changes = pending.current;
        pending.current = {};
        const result = await patchUiPreferences(scope, changes);
        confirmed.current = result.values;
        if (mounted.current) setValues({ ...result.values, ...pending.current });
      }
    } catch {
      pending.current = {};
      if (mounted.current) {
        setValues(confirmed.current);
        setError("설정을 저장하지 못해 이전 값으로 되돌렸습니다. 다시 시도해 주세요.");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [scope, readOnly]);

  useEffect(() => {
    mounted.current = true;
    if (readOnly) {
      setReady(true);
      return () => { mounted.current = false; };
    }
    let cancelled = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || inFlight.current || Object.keys(pending.current).length || document.hidden) return;
      refreshing = true;
      const startedAt = revision.current;
      try {
        let result = await fetchUiPreferences(scope);
        if (!result.exists && legacy && !cancelled && startedAt === revision.current) {
          let changes: UiPreferenceValues = {};
          try {
            const raw = window.localStorage.getItem(legacy.key);
            if (raw) changes = legacy.read(JSON.parse(raw));
          } catch { /* 읽을 수 없는 예전 설정은 보존하고 공유 기본값을 사용한다. */ }
          if (Object.keys(changes).length) result = await patchUiPreferences(scope, changes, true);
        }
        if (!cancelled && startedAt === revision.current && !inFlight.current && !Object.keys(pending.current).length) {
          confirmed.current = result.values;
          setValues(result.values);
          setReady(true);
          setError("");
        }
      } catch {
        if (!cancelled) setError("공유 설정을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
      } finally { refreshing = false; }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      mounted.current = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [scope, legacy, flush, readOnly]);

  const update = useCallback((changes: UiPreferenceValues) => {
    if (readOnly || !ready || !Object.keys(changes).length) return;
    revision.current++;
    pending.current = { ...pending.current, ...changes };
    setValues(current => ({ ...current, ...changes }));
    setSaving(true);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 180);
  }, [ready, flush, readOnly]);

  return { values, update, ready, saving, error };
}

"use client";

import { useState } from "react";
import {
  DatePicker,
  DateRangeFilter,
  type DateRangeMode,
} from "@/components/erp/date-picker";
import { DetailSection } from "@/components/erp/detail-section";

/** 모드별 동작을 따로 확인할 수 있게 각 예시가 자기 from/to 를 갖는다. */
function ModeExample({
  label,
  description,
  modes,
}: {
  label: string;
  description: string;
  modes: DateRangeMode[];
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <div className="flex flex-col gap-1.5 border-b border-[var(--bi-border)] px-6 py-4 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-[var(--bi-fg)]">{label}</span>
        <span className="text-[11px] text-[var(--bi-muted)]">{description}</span>
      </div>
      <div>
        <DateRangeFilter
          ariaLabel={label}
          from={from}
          modes={modes}
          onFromChange={setFrom}
          onToChange={setTo}
          to={to}
        />
      </div>
      <p className="text-[11px] tabular-nums text-[var(--bi-muted)]">
        선택값: {from || "―"} ~ {to || "―"}
      </p>
    </div>
  );
}

export function DatePickerSection() {
  const [single, setSingle] = useState("");
  const [disabled, setDisabled] = useState("2026-08-13");

  return (
    <DetailSection title="5. 날짜·기간 선택">
      <div className="border-b border-[var(--bi-border)] px-6 py-4">
        <p className="mb-3 text-[11px] text-[var(--bi-muted)]">
          단일 날짜 선택 — 날짜를 고르면 즉시 확정되고 팝오버가 닫힙니다. 값은 YYYY-MM-DD.
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-[180px]">
            <DatePicker ariaLabel="단일 날짜" onChange={setSingle} value={single} />
            <p className="mt-1.5 text-[11px] tabular-nums text-[var(--bi-muted)]">
              선택값: {single || "―"}
            </p>
          </div>
          <div className="w-[180px]">
            <DatePicker ariaLabel="비활성" disabled onChange={setDisabled} value={disabled} />
            <p className="mt-1.5 text-[11px] text-[var(--bi-muted)]">disabled</p>
          </div>
          <div className="w-[180px]">
            <DatePicker ariaLabel="에러" error onChange={setSingle} value={single} />
            <p className="mt-1.5 text-[11px] text-[var(--bi-muted)]">error</p>
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--bi-border)] px-6 py-3">
        <p className="text-[11px] text-[var(--bi-muted)]">
          기간 필터 — 시작·종료 탭으로 편집 대상을 고르고, 프리셋 칩이나 달력으로 범위를 잡은 뒤
          &lsquo;적용&rsquo;으로 확정합니다. 모드 버튼을 누르면 해당 단위의 기본 기간이 즉시 적용됩니다.
        </p>
      </div>

      <ModeExample
        description="전체 모드 · 일/주/월/분기/연"
        label="기본 (모든 모드)"
        modes={["day", "week", "month", "quarter", "year"]}
      />
      <ModeExample description="날짜 단위로 시작·종료 지정" label="일" modes={["day"]} />
      <ModeExample description="선택 시 해당 주 전체(월~일)" label="주" modes={["week"]} />
      <ModeExample description="선택 시 해당 월 1일~말일" label="월" modes={["month"]} />
      <ModeExample description="선택 시 해당 분기 전체" label="분기" modes={["quarter"]} />
      <ModeExample description="선택 시 해당 연도 전체" label="연" modes={["year"]} />
    </DetailSection>
  );
}

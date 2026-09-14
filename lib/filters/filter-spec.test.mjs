import assert from "node:assert/strict";
import test from "node:test";
import { activeFilterChips, allFilterKeys, clampSpan, clearAllFilters, clearFilterKeys, countActiveFilters, fieldId, gridTemplate, } from "./filter-spec.ts";
const groups = [
    {
        title: "케이스",
        fields: [
            {
                kind: "select",
                key: "status",
                label: "상태",
                options: [
                    { value: "", label: "상태 전체" },
                    { value: "RECEIVED", label: "1. 접수" },
                ],
            },
            {
                kind: "select",
                key: "partnerId",
                label: "거래처",
                options: [{ value: "", label: "거래처 전체" }],
                searchable: true,
            },
            { kind: "text", key: "contact", label: "연락처", span: 3 },
        ],
    },
    {
        title: "기간",
        columns: 2,
        fields: [{ kind: "dateRange", fromKey: "from", toKey: "to", label: "접수일" }],
    },
];
const empty = {
    status: "",
    partnerId: "",
    contact: "",
    from: "",
    to: "",
};
test("스펙에 선언된 값 key를 선언 순서 그대로 모은다", () => {
    assert.deepEqual(allFilterKeys(groups), [
        "status",
        "partnerId",
        "contact",
        "from",
        "to",
    ]);
});
test("필드의 안정적인 id는 dateRange의 경우 시작 key다", () => {
    assert.equal(fieldId(groups[0].fields[0]), "status");
    assert.equal(fieldId(groups[1].fields[0]), "from");
});
test("빈 값은 칩도 배지 개수도 만들지 않는다", () => {
    assert.deepEqual(activeFilterChips(groups, empty), []);
    assert.equal(countActiveFilters(groups, empty), 0);
});
test("select 칩은 options의 라벨로 표시한다", () => {
    assert.deepEqual(activeFilterChips(groups, { ...empty, status: "RECEIVED" }), [
        { id: "status", label: "상태", valueLabel: "1. 접수", clears: ["status"] },
    ]);
});
test("options에 없는 select 값은 값 자체를 라벨로 쓴다", () => {
    // 통계 드릴다운 직후처럼 옵션이 아직 로드되지 않아도 칩이 비어 보이면 안 된다.
    const chips = activeFilterChips(groups, { ...empty, partnerId: "7" });
    assert.equal(chips[0]?.valueLabel, "7");
});
test("기간은 한쪽만 채워도 칩 하나이고 두 key를 함께 지운다", () => {
    assert.deepEqual(activeFilterChips(groups, { ...empty, from: "2026-08-01" }), [
        {
            id: "from",
            label: "접수일",
            valueLabel: "2026-08-01 ~",
            clears: ["from", "to"],
        },
    ]);
    assert.equal(activeFilterChips(groups, { ...empty, to: "2026-08-23" })[0]?.valueLabel, "~ 2026-08-23");
    const both = activeFilterChips(groups, {
        ...empty,
        from: "2026-08-01",
        to: "2026-08-23",
    });
    assert.equal(both.length, 1);
    assert.equal(both[0]?.valueLabel, "2026-08-01 ~ 2026-08-23");
});
test("배지 개수는 기간 한 쌍을 1개로 센다", () => {
    assert.equal(countActiveFilters(groups, {
        ...empty,
        status: "RECEIVED",
        from: "2026-08-01",
        to: "2026-08-23",
    }), 2);
});
test("칩 해제는 지정한 key만 비운다", () => {
    const value = {
        ...empty,
        status: "RECEIVED",
        from: "2026-08-01",
        to: "2026-08-23",
    };
    assert.deepEqual(clearFilterKeys(value, ["from", "to"]), {
        ...empty,
        status: "RECEIVED",
    });
});
test("전체 해제는 스펙에 없는 key를 건드리지 않는다", () => {
    // q(검색어)는 툴바가 소유하므로 전체 해제 대상이 아니다.
    const withSearch = { ...empty, status: "RECEIVED", q: "누수" };
    assert.deepEqual(clearAllFilters(groups, withSearch), {
        ...empty,
        q: "누수",
    });
});
test("그룹 열 수와 span은 그리드를 깨지 않는 값으로 환산된다", () => {
    assert.equal(gridTemplate(3), "repeat(auto-fit, minmax(160px, 1fr))");
    assert.equal(gridTemplate(2), "repeat(auto-fit, minmax(240px, 1fr))");
    assert.equal(gridTemplate(), "repeat(auto-fit, minmax(160px, 1fr))");
    assert.equal(clampSpan(3, 2), 2);
    assert.equal(clampSpan(2, 3), 2);
    assert.equal(clampSpan(undefined, 3), 1);
});

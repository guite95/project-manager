/* -------------------------------------------------------------------------
 * 날짜가 바뀐 오늘 목록을 어떻게 정리할지 계산한다.
 *
 * 보드 전체에 날짜 하나를 두지 않고 항목마다 붙은 날짜를 본다. 며칠 만에 열어도
 * 항목별 판정이 정확하다.
 *
 * 완료 이력은 여기서 만들지 않는다. 체크하는 순간 이미 쌓였으므로 지난 날짜의
 * 완료 항목은 그냥 지운다.
 * ---------------------------------------------------------------------- */

export type TodayRow = {
  id: string;
  /** 로컬 기준 YYYY-MM-DD. */
  todayDate: string;
  done: boolean;
};

export type RolloverPlan = {
  /** 이슈 풀로 되돌릴 id. */
  returnToPool: string[];
  /** 지울 id. */
  remove: string[];
};

export function planRollover(rows: TodayRow[], today: string): RolloverPlan {
  const returnToPool: string[] = [];
  const remove: string[] = [];

  for (const row of rows) {
    if (row.todayDate >= today) continue;
    if (row.done) remove.push(row.id);
    else returnToPool.push(row.id);
  }

  return { returnToPool, remove };
}

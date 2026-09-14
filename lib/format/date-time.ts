const seoulDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

export function formatSeoulDateTime(value: Date | string): string {
  return seoulDateTimeFormatter.format(
    typeof value === "string" ? new Date(value) : value,
  );
}

const seoulDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 서울 기준 날짜만(YYYY-MM-DD). 목록에서 시:분:초가 의미 없는
 * 견적일·유효기한 같은 업무 날짜 열에 쓴다.
 */
export function formatSeoulDate(value: Date | string | null): string {
  if (value === null) return "-";
  return seoulDateFormatter.format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** 서울 기준 월 키(YYYY-MM). DateTime 월별 집계에 사용한다. */
export function formatSeoulMonth(value: Date | string): string {
  return seoulDateFormatter
    .format(typeof value === "string" ? new Date(value) : value)
    .slice(0, 7);
}

/**
 * 서울 기준 오늘(YYYY-MM-DD). 날짜 입력의 공통 기본값이자 서버 검증 기준이다.
 *
 * 서버·브라우저 타임존과 무관하게 같은 업무 기준일을 내야 한다 — UTC로 판정하면
 * 한국 시간 오전 9시 이전에 오늘이 어제로 밀리고, 브라우저 로컬 시간으로 판정하면
 * 해외 접속자에게 다른 날짜가 잡힌다. SSR prefetch와 클라이언트 초기값이 같은
 * query key를 만들어야 하므로 이 함수 하나만 쓴다.
 */
export function todayInSeoul(now: Date = new Date()): string {
  return seoulDateFormatter.format(now);
}

/** 서울 기준 업무일을 YYMMDD 형식으로 반환한다. */
export function formatYymmddInSeoul(value: Date): string {
  return seoulDateFormatter.format(value).replaceAll("-", "").slice(2);
}

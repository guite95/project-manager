export const SCHEDULE_TIME_ZONE = 'Asia/Seoul';
export const SCHEDULE_HOUR = 20;

function koreaDate(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('INVALID_TIME');
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

/** 서버의 로컬 시간대와 무관하게 한국 시간 당일 20시 이후에만 실행한다. */
export function dueScheduleKey(now = new Date()) {
  const date = koreaDate(now);
  return date.getUTCHours() >= SCHEDULE_HOUR ? date.toISOString().slice(0, 10) : null;
}

export function nextScheduledAt(now = new Date()) {
  const date = koreaDate(now);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 11);
  return new Date(today > now.getTime() ? today : today + 24 * 60 * 60 * 1000).toISOString();
}

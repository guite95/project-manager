-- 기존 이슈·완료 이력은 수정하지 않는다. 공유 DB에는 배포 전에 별도로 적용한다.
CREATE TABLE "issue_schedule" (
  "issue_id" TEXT PRIMARY KEY REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "start_date" TEXT,
  "end_date" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CONSTRAINT "issue_schedule_dates_check" CHECK (
    (start_date IS NULL AND end_date IS NULL) OR
    (start_date IS NOT NULL AND end_date IS NOT NULL
      AND start_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND end_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND start_date::date <= end_date::date)
  )
);

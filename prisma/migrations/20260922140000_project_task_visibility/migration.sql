-- 기존 프로젝트는 현재 할 일 표시를 유지한다. 이슈와 완료 이력은 변경하지 않는다.
ALTER TABLE "flow_project" ADD COLUMN "show_in_tasks" BOOLEAN NOT NULL DEFAULT true;

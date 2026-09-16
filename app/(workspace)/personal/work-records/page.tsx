import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import { loadPersonalWorkRecords } from "@/lib/server/personal-work-records-store";
import type { WorkCommit } from "@/lib/personal-work-records";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "작업 기록 — 개인 공간" };

function CommitList({ commits }: { commits: WorkCommit[] }) {
  return <ul className="mt-3 space-y-2 text-[12px] text-[var(--bi-muted)]">
    {commits.map(commit => <li key={commit.hash} className="break-words">
      <time dateTime={commit.date}>{commit.date}</time>{" · "}
      <code title={commit.hash}>{commit.hash.slice(0, 8)}</code>{" · "}{commit.subject}
    </li>)}
  </ul>;
}

export default async function PersonalWorkRecordsPage() {
  const record = await loadPersonalWorkRecords();
  return <div className="mx-auto max-w-[1200px]">
    <PageHeader title="작업 기록" description="Git 이력으로 정리한 프로젝트별 기여와 작업 근거입니다." />
    <div className="space-y-6 px-6 py-5">
      {!record ? <p className="text-sm text-[var(--bi-muted)]">아직 저장된 작업 기록이 없습니다.</p> : <>
        <div className="space-y-2 text-[12px] text-[var(--bi-muted)]">
          <p className="font-semibold text-[var(--bi-fg)]">{record.asOf} 기준 · {record.author}</p>
          <p>{record.scope}</p>
          <p>커밋 메시지 기반 요약입니다. 커밋 수는 완료 업무 수나 투입시간이 아니며 재적용 이력이 포함될 수 있습니다. 테스트·배포 성공과 현재 운영 반영 여부는 별도로 검증하지 않았습니다.</p>
        </div>
        {record.projects.map(project => <details key={project.id} name="work-project" className="rounded-[3px] border border-[var(--bi-border)]">
          <summary className="cursor-pointer px-5 py-4">
            <span className="text-[15px] font-semibold">{project.title}</span>
            <span className="ml-3 inline-block text-[12px] text-[var(--bi-muted)]">{project.periodStart} ~ {project.periodEnd} · {project.groups.length}개 작업 분야 · {project.commitCount.toLocaleString("ko-KR")}개 커밋</span>
          </summary>
          <div className="space-y-5 border-t border-[var(--bi-border)] px-5 py-5">
            <p className="text-[12px] text-[var(--bi-muted)]">단순 병합 {project.mergeCount}개 제외 · 아래 근거는 전체 이력에서 발췌했습니다.</p>
            {project.groups.map(group => <section key={group.title}>
              <h2 className="text-[14px] font-semibold">{group.title}</h2>
              <p className="mt-2 text-[13px] leading-6">{group.summary}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] text-[var(--bi-muted)]">근거 커밋 {group.commits.length}개</summary>
                <CommitList commits={group.commits} />
              </details>
            </section>)}
            <section className="border-t border-[var(--bi-border)] pt-4">
              <h2 className="text-[14px] font-semibold">최근 작업</h2>
              <CommitList commits={project.latest} />
            </section>
          </div>
        </details>)}
      </>}
    </div>
  </div>;
}

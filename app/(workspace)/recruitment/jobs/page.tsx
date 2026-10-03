import type { Metadata } from 'next';
import { PageHeader } from '@/components/erp/page-header';
import { RecruitmentJobs } from '@/components/recruitment/recruitment-jobs';

export const metadata: Metadata = { title: '채용공고 — 프로젝트 매니지먼트' };
export default function Page() {
  return <div className="min-w-0 w-full"><PageHeader title="채용공고" description="수집된 공고를 확인하고, 지원하지 않을 공고는 삭제할 수 있습니다." /><RecruitmentJobs /></div>;
}

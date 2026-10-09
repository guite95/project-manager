import type { Metadata } from 'next';
import { PageHeader } from '@/components/erp/page-header';
import { RecruitmentApplications } from '@/components/recruitment/recruitment-applications';

export const metadata: Metadata = { title: '지원 현황 — 프로젝트 매니지먼트' };

export default function Page() {
  return <div className="min-w-0 w-full"><PageHeader title="지원 현황" description="지원 일정과 진행 상황을 확인하고, 준비 자료와 할 일을 연결합니다." /><RecruitmentApplications /></div>;
}

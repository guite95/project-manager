import type { Metadata } from 'next';
import { PageHeader } from '@/components/erp/page-header';
import { RecruitmentWorkspace } from '@/components/recruitment/recruitment-workspace';

export const metadata: Metadata = { title: '경험정리 — 프로젝트 매니지먼트' };
export default function Page() {
  return <div className="mx-auto max-w-[1500px]"><PageHeader title="경험정리" description="회사와 개인 프로젝트의 경험, 본인 기여와 확인된 근거를 정리합니다." /><RecruitmentWorkspace kind="EXPERIENCE" /></div>;
}

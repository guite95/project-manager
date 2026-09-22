import type { Metadata } from 'next';
import { PageHeader } from '@/components/erp/page-header';
import { RecruitmentWorkspace } from '@/components/recruitment/recruitment-workspace';

export const metadata: Metadata = { title: '자기소개서 — 프로젝트 매니지먼트' };
export default function Page() {
  return <div className="mx-auto max-w-[1500px]"><PageHeader title="자기소개서" description="지원 회사와 문항에 맞춰 경험을 선택하고 자기소개서를 작성합니다." /><RecruitmentWorkspace kind="COVER_LETTER" /></div>;
}

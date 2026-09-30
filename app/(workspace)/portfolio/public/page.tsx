import { PageHeader } from '@/components/erp/page-header';
import { PublicPortfolioEditor } from '@/components/recruitment/public-portfolio-editor';

export const metadata = { title: '공개 포트폴리오 관리 — 프로젝트 매니지먼트' };
export default function PublicPortfolioManagementPage() {
  return <div className="min-w-0 w-full"><PageHeader title="공개 포트폴리오 관리" description="외부에 공유할 소개와 프로젝트를 편집합니다." /><PublicPortfolioEditor /></div>;
}

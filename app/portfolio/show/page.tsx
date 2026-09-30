import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicPortfolioView } from '@/components/recruitment/public-portfolio-view';
import { getPublishedPortfolio } from '@/lib/server/public-portfolio-store';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublishedPortfolio();
  return {
    title: content ? `${content.name} | 포트폴리오` : '포트폴리오',
    description: content?.headline ?? '공개 포트폴리오',
    robots: { index: false, follow: false }, referrer: 'no-referrer',
    openGraph: content ? { title: `${content.name} | 포트폴리오`, description: content.headline, type: 'profile', locale: 'ko_KR' } : undefined,
  };
}
export default async function PublicPortfolioPage() {
  const content = await getPublishedPortfolio();
  if (!content) notFound();
  return <PublicPortfolioView content={content} />;
}

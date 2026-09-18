import { notFound } from 'next/navigation';
import { resolveShare } from '@/lib/access/store';
import { getFlowDocument } from '@/lib/server/flows-store';
import { ProjectContentView } from '@/components/flow/project-content';
import { ProcessFlow } from '@/components/flow/process-flow';
export const dynamic='force-dynamic';
export const metadata={title:'공유 문서',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function SharedPage({params}:{params:Promise<{token:string}>}) {
  const share=await resolveShare((await params).token);
  if(!share) notFound();
  const document=await getFlowDocument(share.projectSlug,share.chartSlug);
  if(!document || document.chart.erdDomain) notFound();
  const chart=document.chart;
  return <main className="mx-auto max-w-[1200px] px-4 py-6">
    <p className="mb-4 text-xs text-[var(--bi-muted)]">공유 문서 · 조회 전용 · {share.expiresAt.toISOString().slice(0,10)}까지</p>
    <h1 className="mb-3 text-xl font-bold">{chart.title}</h1>
    {chart.description&&<p className="mb-4 text-sm">{chart.description}</p>}
    {chart.content?<ProjectContentView chart={chart}/>:<ProcessFlow chart={chart} />}
  </main>;
}

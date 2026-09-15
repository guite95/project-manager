import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import { getFlowDocument } from './flows-store.ts';
import type { MeetingSummary } from '../meetings.ts';

/** 목록에는 회의 본문이나 전사본을 가져오지 않는다. */
export async function listMeetings(projectSlug: string): Promise<MeetingSummary[]> {
  return prisma.$queryRaw<MeetingSummary[]>(Prisma.sql`
    SELECT slug, document->>'title' AS title,
      document->'content'->>'date' AS date,
      document->'content'->'participants' AS participants
    FROM flow_document
    WHERE project_slug = ${projectSlug} AND document->'content'->>'kind' = 'meeting'
    ORDER BY document->'content'->>'date' DESC, slug DESC
  `);
}

export const getMeeting = cache(async (projectSlug: string, slug: string) => {
  const record = await getFlowDocument(projectSlug, slug);
  if (!record || record.chart.content?.kind !== 'meeting') return null;
  return { slug: record.chart.slug, title: record.chart.title, content: record.chart.content, chart: record.chart, revision: record.revision };
});

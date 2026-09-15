import { NextResponse, type NextRequest } from 'next/server';
import { getTnsErdSnapshot } from '@/lib/server/flows-store';
import { getTnsErdLayout } from '@/lib/server/erd-layout-store';
import { erdDomains } from '@/lib/erd/chart';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const domain = query.get('domain') ?? '';
  const focus = query.get('focus') || undefined;
  const headers = {'Cache-Control':'private, no-store'};
  if (!erdDomains.some(d => d.slug === domain)) return NextResponse.json({message:'업무 영역이 올바르지 않습니다.'},{status:400,headers});
  try {
    const snapshot = await getTnsErdSnapshot();
    if (focus && !snapshot.models.some(m => m.name === focus)) return NextResponse.json({message:'테이블을 찾지 못했습니다.'},{status:404,headers});
    const layout = await getTnsErdLayout(snapshot,domain,focus);
    if (!layout) return NextResponse.json({message:'저장된 배치가 없습니다.'},{status:404,headers});
    if (query.has('snapshot') && query.get('snapshot') !== layout.snapshotHash) return NextResponse.json({message:'테이블 구조가 변경되었습니다. 새로고침해 주세요.'},{status:409,headers});
    return NextResponse.json(layout,{headers});
  } catch {
    return NextResponse.json({message:'배치를 불러오지 못했습니다.'},{status:500,headers});
  }
}

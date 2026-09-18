import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from './lib/session';
import { resolveActor } from './lib/access/store';
import { permits, routeRequirement } from './lib/access/policy';
import { sameOrigin } from './lib/access/http';
import { prisma } from './lib/db';
export async function proxy(request: NextRequest) {
  const pathname=request.nextUrl.pathname;
  const read=request.method==='GET'||request.method==='HEAD';
  const protect=(response: NextResponse)=>{
    response.headers.set('Cache-Control','private, no-store');
    response.headers.set('Referrer-Policy','no-referrer');
    response.headers.set('X-Robots-Tag','noindex, nofollow');
    return response;
  };
  if(!read && !sameOrigin(request)) return protect(NextResponse.json({message:'다른 출처의 요청은 허용하지 않습니다.'},{status:403}));
  if(!read && pathname.startsWith('/share/')) return protect(new NextResponse(null,{status:405,headers:{Allow:'GET, HEAD'}}));
  if(read && (pathname==='/login'||/^\/(invite|share)\/[A-Za-z0-9_-]{43}$/.test(pathname)) || request.method==='POST' && ['/api/login','/api/invite'].includes(pathname)) return protect(NextResponse.next());
  try {
    const actor=await resolveActor(request.cookies.get(SESSION_COOKIE_NAME)?.value??'');
    if(!actor) {
      if(pathname.startsWith('/api/')) return protect(NextResponse.json({message:'로그인이 필요합니다.'},{status:401}));
      return protect(NextResponse.redirect(new URL('/login',request.url)));
    }
    let requirement=routeRequirement(pathname,request.method);
    if(requirement.kind==='note') {
      const note=await prisma.projectNote.findUnique({where:{id:requirement.id},select:{projectSlug:true}});
      requirement=note?{kind:'project',project:note.projectSlug,action:requirement.action}:{kind:'deny'};
    }
    if(!permits(actor,requirement)) {
      if(pathname.startsWith('/api/')) return protect(NextResponse.json({message:'이 작업에 대한 권한이 없습니다.'},{status:403}));
      return protect(new NextResponse('이 페이지에 접근할 권한이 없습니다.',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8'}}));
    }
    return protect(NextResponse.next());
  } catch {
    if(read && !pathname.startsWith('/api/')) {
      return protect(NextResponse.redirect(new URL('/login?error=auth-unavailable',request.url)));
    }
    return protect(NextResponse.json({message:'계정 저장소를 확인할 수 없습니다. 관리자에게 문의하세요.'},{status:503}));
  }
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)']};

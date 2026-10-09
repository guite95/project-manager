import {headers} from 'next/headers';
import {careerConnectionView} from '@/lib/server/career-oauth';
import {ConnectionForm} from './connection-form';
export async function ConnectionPage({mode}:{mode:'login'|'consent'|'manage'}){
  const view=await careerConnectionView(new Headers(await headers()),mode);
  return <main className="flex min-h-screen items-center justify-center bg-[var(--bi-bg)] p-6 text-[var(--bi-fg)]">
    {view?<ConnectionForm mode={mode} {...view}/>:<div className="max-w-lg space-y-3"><h1 className="text-lg font-semibold">연결을 시작할 수 없습니다</h1><p>연결을 요청한 앱에서 다시 시작해 주세요. 연결 요청은 5분 동안 유효하며, 서버에 등록된 소유자 계정만 사용할 수 있습니다.</p></div>}
  </main>;
}

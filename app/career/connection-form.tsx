'use client';
import {useState,type FormEvent} from 'react';
import {Button} from '@/components/erp/button';
import {Feedback,Field,postAccess} from '@/components/access/form';

const labels:Record<string,string>={
  'career:read':'내 취업 문서와 평가 결과 읽기',
  'career:evaluate':'Jev로 자기소개서 평가·재평가하기 (별도 실행 동의 및 비용 한도 적용)',
  'career:write':'검토한 초안을 저장하기 (별도 저장 동의 및 문서 버전 확인)',
  offline_access:'매번 로그인하지 않고 연결 유지하기 (최대 30일)',
};
export function ConnectionForm({mode,signedIn,scopes,redirectUri}:{mode:'login'|'consent'|'manage';signedIn:boolean;scopes:string[];redirectUri:string}){
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),[done,setDone]=useState(false);
  async function run(accept=true){
    if(pending)return;setPending(true);setError(null);
    try{
      if(mode==='login'&&!signedIn){await postAccess('/api/login',{username,password});setPassword('');}
      const path=mode==='login'?'owner-bridge':mode==='manage'?'disconnect':'oauth2/consent';
      const response=await fetch('/api/career-auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mode==='consent'?{accept,oauth_query:window.location.search.slice(1)}:{})});
      if(!response.ok)throw new Error('연결 요청이 만료되었거나 소유자 인증을 확인할 수 없습니다. ChatGPT에서 연결을 다시 시작해 주세요.');
      const body=await response.json();
      if(mode==='manage'){setDone(true);return;}
      const target=new URL(mode==='login'?body.redirect_uri:(body.url??body.redirect_uri));
      const expected=new URL(mode==='login'?'/api/career-auth/oauth2/authorize':redirectUri,window.location.origin);
      if(target.origin!==expected.origin||target.pathname!==expected.pathname)throw new Error('연결 응답을 확인할 수 없습니다.');
      window.location.assign(target.href);
    }catch(cause){setError(cause instanceof Error?cause.message:'연결에 실패했습니다.');}
    finally{setPending(false);}
  }
  function submit(event:FormEvent){event.preventDefault();void run();}
  return <form className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-[var(--bi-border)] p-6" onSubmit={submit}>
    <h1 className="text-lg font-semibold">{mode==='manage'?'ChatGPT 연결 관리':'ChatGPT 취업 지원 도구 연결'}</h1>
    {mode==='manage'?<p>연결을 해제하면 기존 접근·갱신 토큰이 모두 무효화됩니다. 프로젝트 매니지먼트의 로그인과 저장된 문서는 유지됩니다.</p>:<>
      <p>기존 프로젝트 매니지먼트 소유자 계정으로 연결합니다. 카카오·Auth0 계정이나 별도 가입은 필요하지 않습니다.</p>
      <ul className="list-disc space-y-2 pl-5 text-sm">{scopes.map(scope=><li key={scope}>{labels[scope]??scope}</li>)}</ul>
      <p className="text-xs text-[var(--bi-muted)]">연결 동의만으로 Jev를 호출하거나 문서를 수정하지 않습니다. 연결 해제는 /career/connection에서 할 수 있습니다.</p>
    </>}
    {mode==='login'&&!signedIn&&<>
      <Field label="소유자 아이디" autoComplete="username" value={username} required maxLength={64} onChange={e=>setUsername(e.target.value)} disabled={pending}/>
      <Field label="비밀번호" type="password" autoComplete="current-password" value={password} required onChange={e=>setPassword(e.target.value)} disabled={pending}/>
    </>}
    {done?<p role="status">연결을 해제했습니다. 다시 사용하려면 ChatGPT에서 재연결하세요.</p>:<>
      <Button type="submit" loading={pending}>{mode==='manage'?'연결 해제':mode==='consent'?'위 권한에 동의하고 연결':signedIn?'이 계정으로 계속':'로그인하고 계속'}</Button>
      {mode==='consent'&&<Button type="button" disabled={pending} onClick={()=>void run(false)}>동의하지 않음</Button>}
    </>}
    <Feedback error={error}/>
  </form>;
}

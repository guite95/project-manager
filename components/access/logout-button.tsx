'use client';
import { useState } from 'react';
export function LogoutButton() {
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  return <><button disabled={pending} onClick={async()=>{
    setPending(true);setError('');
    try {
      const result=await fetch('/api/logout',{method:'POST'});
      if(result.ok||result.status===401) window.location.assign('/login');
      else throw new Error();
    } catch {setError('로그아웃하지 못했습니다. 다시 시도하세요.');setPending(false);}
  }}>{pending?'로그아웃 중…':'로그아웃'}</button>{error&&<span role="alert">{error}</span>}</>;
}

'use client';
import { useState } from 'react';
import { HiOutlineLogout } from 'react-icons/hi';
import { Button } from '@/components/erp/button';

export function LogoutButton({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  return <><Button className={className} size={compact?'icon-md':'md'} variant={compact?'subtle':'secondary'} aria-label={compact?'로그아웃':undefined} title={compact?'로그아웃':undefined} disabled={pending} onClick={async()=>{
    setPending(true);setError('');
    try {
      const result=await fetch('/api/logout',{method:'POST'});
      if(result.ok||result.status===401) window.location.assign('/login');
      else throw new Error();
    } catch {setError('로그아웃하지 못했습니다. 다시 시도하세요.');setPending(false);}
  }}>{compact?<HiOutlineLogout size={17} aria-hidden />:pending?'로그아웃 중…':'로그아웃'}</Button>{error&&<span role="alert" className={compact?'sr-only':'text-[11px] text-[var(--bi-error)]'}>{error}</span>}</>;
}

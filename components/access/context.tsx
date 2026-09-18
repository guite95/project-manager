'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { canProject, type Actor } from '@/lib/access/policy';
const AccessContext=createContext<Actor|null>(null);
export function AccessProvider({actor,children}:{actor:Actor;children:ReactNode}) {
  return <AccessContext.Provider value={actor}>{children}</AccessContext.Provider>;
}
export function useAccess() {
  const actor=useContext(AccessContext);
  return {role:actor?.role??'',memberships:actor?.memberships??[],canWrite:(project:string)=>canProject(actor,project,'write'),canDelete:(project:string)=>canProject(actor,project,'delete')};
}

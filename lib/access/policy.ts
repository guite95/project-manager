export type Actor = { id: string; username?: string; name?: string; role: string; bootstrap?: boolean; projectScopes?: Record<string, string>; memberships: { projectSlug: string; role: string }[] };
export type Action = 'read' | 'write' | 'delete';
export type Requirement = { kind: 'owner' | 'admin' | 'authenticated' | 'deny' } | { kind: 'project'; project: string; action: Action } | { kind: 'note'; id: string; action: Action };
export const isAdmin = (actor: Actor | null) => actor?.role === 'OWNER' || actor?.role === 'ADMIN';
export function canProject(actor: Actor | null, slug: string, action: Action): boolean {
  if (!actor) return false;
  if (actor.role === 'OWNER') return true;
  if (actor.role === 'ADMIN' && actor.projectScopes?.[slug] === 'COMPANY') return true;
  const membership = actor.memberships.find(item => item.projectSlug === slug);
  return membership?.role === 'EDITOR' ? action !== 'delete' : membership?.role === 'VIEWER' && action === 'read';
}
const read = (method: string) => method === 'GET' || method === 'HEAD';
/** 명시적으로 허용한 경로만 일반 계정에 연다. 새 기능은 자동 공개하지 않는다. */
export function routeRequirement(path: string, method: string): Requirement {
  try {
    const parts=path.split('/').map(part=>decodeURIComponent(part));
    if(parts.some(part=>/[\\/]/.test(part) || part==='.' || part==='..')) return {kind:'deny'};
    path=parts.join('/');
  } catch { return {kind:'deny'}; }
  if (read(method) && ['/', '/flows', '/account', '/api/flows', '/api/flows/navigation'].includes(path)) return {kind:'authenticated'};
  if (path === '/api/logout' && method === 'POST' || path === '/api/account/password' && method === 'POST') return {kind:'authenticated'};
  if (path === '/api/project-registry' && ['GET','POST','PATCH'].includes(method)) return {kind:'admin'};
  if (path === '/settings' && read(method) || path === '/api/access' && ['GET','POST'].includes(method)) return {kind:'admin'};
  let match = path.match(/^\/flows\/([^/]+)(?:\/(notes|materials|meetings|recordings)(?:\/([^/]+))?)?$/);
  if (match && read(method)) return {kind:'project',project:match[1],action:'read'};
  match = path.match(/^\/api\/flows\/([^/]+)\/recordings(?:\/([^/]+)\/(audio|transcript|text|retry))?$/);
  if (match) {
    if (read(method) && (!match[2] || match[3] !== 'retry')) return {kind:'project',project:match[1],action:'read'};
    if (method === 'POST' && (!match[2] || match[3] === 'retry')) return {kind:'project',project:match[1],action:'write'};
    return {kind:'deny'};
  }
  match = path.match(/^\/api\/flows\/([^/]+)\/([^/]+)$/);
  if (match && (read(method) || method === 'PUT' && match[2] !== 'materials' || method === 'POST' && match[2] === 'materials'))
    return {kind:'project',project:match[1],action:read(method)?'read':'write'};
  match = path.match(/^\/api\/flows\/([^/]+)\/materials\/([^/]+)$/);
  if (match && method === 'DELETE') return {kind:'project',project:match[1],action:'delete'};
  match = path.match(/^\/api\/notes\/item\/([^/]+)$/);
  if (match && ['PATCH','DELETE'].includes(method)) return {kind:'note',id:match[1],action:method==='DELETE'?'delete':'write'};
  match = path.match(/^\/api\/notes\/([^/]+)(\/order)?$/);
  if (match && (read(method) && !match[2] || method==='POST' && !match[2] || method==='PUT' && match[2]))
    return {kind:'project',project:match[1],action:read(method)?'read':'write'};
  if (path === '/api/erd/tns/layout' && read(method)) return {kind:'project',project:'tns',action:'read'};
  return {kind:'owner'};
}
export function permits(actor: Actor | null, requirement: Requirement): boolean {
  if (!actor) return false;
  switch (requirement.kind) {
    case 'authenticated': return true;
    case 'owner': return actor.role === 'OWNER';
    case 'admin': return isAdmin(actor);
    case 'project': return canProject(actor,requirement.project,requirement.action);
    default: return false;
  }
}

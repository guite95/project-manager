export const PROJECT_REGISTRY_VERSION = 1;
export type ProjectScope = 'COMPANY' | 'PERSONAL';
export type RepositoryLink = { workspace: 'UK' | 'PROJECTS'; path: string };
export type ManagedProject = {
  slug: string; title: string; scope: ProjectScope; personalGroup: string | null;
  revision: number; showInTasks: boolean; repositories: RepositoryLink[];
};
export class ProjectRegistryError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function projectInput(input: Record<string, unknown>) {
  if (input.showInTasks !== undefined && typeof input.showInTasks !== 'boolean') throw new ProjectRegistryError('할 일 표시 여부를 확인하세요.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 100) throw new ProjectRegistryError('프로젝트 이름은 1~100자로 입력하세요.');
  if (!Array.isArray(input.repositories) || input.repositories.length > 50) throw new ProjectRegistryError('연결 저장소는 50개까지 등록할 수 있습니다.');
  const repositories = input.repositories.map((row: unknown): RepositoryLink => {
    if (!row || typeof row !== 'object' || !('workspace' in row) || !('path' in row) ||
        !['UK','PROJECTS'].includes(String(row.workspace)) || typeof row.path !== 'string') throw new ProjectRegistryError('저장소 경로를 확인하세요.');
    const path = row.path.trim();
    if (!path || path.length > 300 || path.startsWith('/') || path.endsWith('/') || /[\\\x00-\x1f\x7f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') || /^[A-Za-z]:/.test(path) || path.startsWith('~'))
      throw new ProjectRegistryError('저장소는 작업 폴더 기준 상대 경로로 입력하세요.');
    return { workspace: row.workspace as RepositoryLink['workspace'], path };
  });
  if (new Set(repositories.map(row => `${row.workspace}:${row.path}`)).size !== repositories.length) throw new ProjectRegistryError('같은 저장소를 중복으로 연결할 수 없습니다.');
  return { title, repositories };
}

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { WorkProject } from './work-summary.ts';

/** DB에 연결된 정확한 경로만 사용한다. 수집 루트나 동명 폴더로 소속을 추측하지 않는다. */
export function projectForRepository(repositoryPath: string, projects: WorkProject[], roots = {
  UK: join(homedir(), 'uk'), PROJECTS: join(homedir(), 'Documents/project'),
}): string | undefined {
  const path = resolve(repositoryPath);
  return projects.find(project => project.repositories?.some(repo => path === resolve(roots[repo.workspace], repo.path)))?.key;
}

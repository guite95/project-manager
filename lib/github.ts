export type GitHubRepository = {
  id: number;
  fullName: string;
  url: string;
  private: boolean;
  defaultBranch: string;
};
export type GitHubRepositoryLink = GitHubRepository & {
  credentialId?: string;
  accountId: number;
  accountLogin: string;
  verifiedAt: string;
};
export type GitHubConnectionStatus = {
  configured: boolean;
  credentials: GitHubCredential[];
};
export type GitHubCredential = {
  id: string;
  label: string;
  accountId: number;
  accountLogin: string;
  expiresAt: number;
};

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateGitHubCredential(input: { label?: unknown; token?: unknown; expiresOn?: unknown }, now = Date.now()) {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!label || label.length > 80 || /[\u0000-\u001f]/.test(label)) throw new GitHubError("토큰을 구분할 이름을 80자 이내로 입력해 주세요.");
  if (!/^github_pat_[a-zA-Z0-9_]{20,250}$/.test(token)) throw new GitHubError("세분화된 개인 액세스 토큰(Fine-grained PAT)을 입력해 주세요.");
  const date = input.expiresOn;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    throw new GitHubError("앱에서 토큰을 사용할 종료일을 입력해 주세요.");
  const expiresAt = Date.parse(`${date}T23:59:59+09:00`);
  const lastDate = new Date(now + 9 * 3600000 + 90 * 86400000).toISOString().slice(0, 10);
  if (expiresAt <= now || date > lastDate) throw new GitHubError("사용 종료일은 오늘부터 90일 이내로 지정해 주세요.");
  return { label, token, expiresAt };
}

export function parseGitHubRepositoryUrl(input: unknown) {
  if (typeof input !== "string" || input.length > 500 || /[\\\u0000-\u001f]/.test(input))
    throw new GitHubError("GitHub 레포지토리 주소를 입력해 주세요.");
  // 경로 정규화 전에 원문을 검사하여 우회 경로·인증정보를 받지 않는다.
  const match = /^https:\/\/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}))\/([a-zA-Z0-9_.-]+)\/?$/i.exec(input.trim());
  if (!match) throw new GitHubError("https://github.com/소유자/레포지토리 형식으로 입력해 주세요.");
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  if (!repo || repo === "." || repo === ".." || repo.length > 100)
    throw new GitHubError("레포지토리 이름을 확인해 주세요.");
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

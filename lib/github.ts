export type GitHubRepository = {
  id: number;
  fullName: string;
  url: string;
  private: boolean;
  defaultBranch: string;
};
export type GitHubRepositoryLink = GitHubRepository & {
  accountId: number;
  accountLogin: string;
  verifiedAt: string;
};
export type GitHubConnectionStatus = {
  configured: boolean;
  callbackUrl: string;
  installationUrl: string | null;
  account: { id: number; login: string } | null;
};

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
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

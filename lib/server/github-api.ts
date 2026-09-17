import { GitHubError, parseGitHubRepositoryUrl, type GitHubRepository } from "../github.ts";

type Fetch = typeof fetch;
export type GitHubTokens = { accessToken: string; refreshToken: string; expiresAt: number; refreshExpiresAt: number };

async function requestJson(url: string, init: RequestInit, request: Fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await request(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  } catch { throw new GitHubError("GitHub에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502); }
  if (response.status === 401) throw new GitHubError("GitHub 계정을 다시 연결해 주세요.", 401);
  if (response.status === 403 || response.status === 429)
    throw new GitHubError("GitHub 접근이 제한되었습니다. 앱 권한·조직 승인 또는 API 제한을 확인해 주세요.", 403);
  if (response.status === 404) throw new GitHubError("레포지토리를 찾지 못했습니다. 주소와 GitHub App의 접근 허용을 확인해 주세요.", 404);
  if (!response.ok) throw new GitHubError("GitHub 요청을 처리하지 못했습니다.", 502);
  try { return await response.json(); } catch { throw new GitHubError("GitHub 응답을 확인하지 못했습니다.", 502); }
}

export function githubGet(path: string, token: string, request: Fetch = fetch) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new GitHubError("GitHub 요청 경로가 올바르지 않습니다.");
  return requestJson(`https://api.github.com${path}`, { headers: {
    Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10",
  } }, request);
}

export async function getGitHubUser(token: string, request: Fetch = fetch) {
  const user = await githubGet("/user", token, request) as { id?: unknown; login?: unknown };
  if (!user || !Number.isSafeInteger(user.id) || typeof user.login !== "string" || !/^[a-zA-Z0-9-]+$/.test(user.login))
    throw new GitHubError("GitHub 계정 정보를 확인하지 못했습니다.", 502);
  return { id: user.id as number, login: user.login };
}

export async function verifyGitHubRepository(url: unknown, token: string, request: Fetch = fetch): Promise<GitHubRepository> {
  const {owner, repo} = parseGitHubRepositoryUrl(url);
  const data = await githubGet(`/repos/${owner}/${repo}`, token, request) as Record<string, unknown>;
  if (!data || !Number.isSafeInteger(data.id) || typeof data.full_name !== "string" || typeof data.private !== "boolean" || typeof data.default_branch !== "string")
    throw new GitHubError("레포지토리 정보를 확인하지 못했습니다.", 502);
  const canonical = parseGitHubRepositoryUrl(`https://github.com/${data.full_name}`);
  // 공개 레포 조회 성공이나 permissions.pull만으로 참여자로 판단하지 않는다.
  for (let page = 1; page <= 50; page++) {
    const entries = await githubGet(`/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${page}`, token, request);
    if (!Array.isArray(entries)) throw new GitHubError("참여 레포지토리 목록을 확인하지 못했습니다.", 502);
    if (entries.some(entry => entry?.id === data.id)) return {
      id: data.id as number, fullName: `${canonical.owner}/${canonical.repo}`, url: canonical.url,
      private: data.private, defaultBranch: data.default_branch,
    };
    if (entries.length < 100) throw new GitHubError("본인이 소유하거나 참여 중인 레포지토리만 연결할 수 있습니다. 앱의 레포지토리 접근 허용도 확인해 주세요.", 403);
  }
  throw new GitHubError("참여 레포지토리 목록이 너무 많아 확인을 마치지 못했습니다.", 422);
}

async function exchange(params: Record<string, string>, request: Fetch): Promise<GitHubTokens> {
  const data = await requestJson("https://github.com/login/oauth/access_token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  }, request) as Record<string, unknown>;
  if (data.error) throw new GitHubError("GitHub 인증이 만료되었거나 취소되었습니다. 다시 연결해 주세요.", 401);
  if (typeof data.access_token !== "string" || !data.access_token.startsWith("ghu_") ||
      typeof data.refresh_token !== "string" || !data.refresh_token.startsWith("ghr_") ||
      typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 28800 ||
      typeof data.refresh_token_expires_in !== "number" || !Number.isFinite(data.refresh_token_expires_in) || data.refresh_token_expires_in <= 0)
    throw new GitHubError("GitHub App에서 사용자 토큰 만료 기능을 활성화해 주세요.", 502);
  return { accessToken: data.access_token, refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000, refreshExpiresAt: Date.now() + data.refresh_token_expires_in * 1000 };
}

export function exchangeGitHubCode(config: {clientId: string; callbackUrl: string}, clientSecret: string, code: string, verifier: string, request: Fetch = fetch) {
  return exchange({ client_id: config.clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: config.callbackUrl }, request);
}
export function refreshGitHubToken(clientId: string, clientSecret: string, refreshToken: string, request: Fetch = fetch) {
  return exchange({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }, request);
}

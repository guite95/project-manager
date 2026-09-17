import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.ts";
import { isPersonalProject } from "../personal-projects.ts";
import { GitHubError, type GitHubRepository, type GitHubRepositoryLink } from "../github.ts";
import { exchangeGitHubCode, getGitHubUser, refreshGitHubToken, verifyGitHubRepository, type GitHubTokens } from "./github-api.ts";
import { githubConfig, requireGitHubConfig } from "./github-config.ts";
import { readGitHubSecret, writeGitHubTokens } from "./github-secrets.ts";

const ACCOUNT_KEY = "github:account";
const OAUTH_KEY = "github:oauth-pending";
const linkKey = (slug: string) => `github:repository:${slug}`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
type Account = { id: number; login: string };
type StoredTokens = GitHubTokens & { account: Account };

export function assertPersonalGitHubProject(slug: string) {
  if (!isPersonalProject(slug)) throw new GitHubError("개인 프로젝트에만 GitHub 레포지토리를 연결할 수 있습니다.", 404);
}

export async function gitHubConnectionStatus() {
  const config = githubConfig();
  const row = await prisma.appSetting.findUnique({ where: { key: ACCOUNT_KEY } });
  const account = row?.value as Account | null;
  return { configured: !!config, installationUrl: config?.installationUrl ?? null,
    callbackUrl: config?.callbackUrl ?? "https://project.dev-uk.shop/api/github/callback",
    account: account && typeof account.login === "string" && Number.isSafeInteger(account.id) ? { id: account.id, login: account.login } : null };
}

export async function loadGitHubRepository(slug: string): Promise<GitHubRepositoryLink | null> {
  assertPersonalGitHubProject(slug);
  const row = await prisma.appSetting.findUnique({ where: { key: linkKey(slug) } });
  return row ? row.value as unknown as GitHubRepositoryLink : null;
}

export async function beginGitHubAuthorization(session: string) {
  const config = requireGitHubConfig();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const value = { stateHash: digest(state), sessionHash: digest(session), verifierHash: digest(verifier), expiresAt: Date.now() + 600000 };
  // 단일 소유자 앱: 새 연결 시 이전 미완료 요청을 대체한다. 토큰은 DB에 저장하지 않는다.
  await prisma.appSetting.upsert({ where: { key: OAUTH_KEY }, create: { key: OAUTH_KEY, value }, update: { value } });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callbackUrl, state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", allow_signup: "false" }).toString();
  return { url: url.toString(), verifier };
}

export async function completeGitHubAuthorization(session: string, state: string, code: string, verifier: string) {
  if (!/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(verifier) || !code || code.length > 512)
    throw new GitHubError("GitHub 연결 요청이 만료되었습니다. 다시 시도해 주세요.");
  if (!(await consumeGitHubAuthorization(session, state, verifier)))
    throw new GitHubError("GitHub 연결 요청이 만료되었거나 이미 사용되었습니다. 다시 시도해 주세요.");
  const config = requireGitHubConfig();
  const tokens = await exchangeGitHubCode(config, (await readGitHubSecret("client")).trim(), code, verifier);
  const account = await getGitHubUser(tokens.accessToken);
  await withTokenLock(async tx => {
    await writeGitHubTokens({ ...tokens, account });
    await tx.appSetting.upsert({ where: { key: ACCOUNT_KEY }, create: { key: ACCOUNT_KEY, value: account }, update: { value: account } });
  });
}

export async function consumeGitHubAuthorization(session: string, state: string, verifier: string) {
  return prisma.$transaction(async tx => {
    const pending = await tx.appSetting.findUnique({ where: { key: OAUTH_KEY } });
    const value = pending?.value as {stateHash?: string; sessionHash?: string; verifierHash?: string; expiresAt?: number} | null;
    if (!pending || !value || value.stateHash !== digest(state) || value.sessionHash !== digest(session) || value.verifierHash !== digest(verifier) || (value.expiresAt ?? 0) <= Date.now()) return false;
    const deleted = await tx.appSetting.deleteMany({ where: { key: OAUTH_KEY, value: { equals: pending.value! } } });
    return deleted.count === 1;
  });
}

type Transaction = Prisma.TransactionClient;
async function withTokenLock<T>(action: (tx: Transaction) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    // 토큰 교체·갱신을 프로세스와 서버를 넘어 직렬화한다.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(71892345) IS NULL AS locked`;
    return action(tx);
  }, { timeout: 60000, maxWait: 10000 });
}

async function currentTokens(): Promise<StoredTokens> {
  return withTokenLock(async () => {
    const config = requireGitHubConfig();
    let saved: StoredTokens;
    try { saved = JSON.parse(await readGitHubSecret("tokens")); }
    catch (error) { if (error instanceof GitHubError) throw error; throw new GitHubError("GitHub 계정을 연결해 주세요.", 401); }
    if (!saved?.account || !Number.isSafeInteger(saved.account.id) || typeof saved.account.login !== "string" ||
        typeof saved.accessToken !== "string" || !saved.accessToken.startsWith("ghu_") ||
        typeof saved.refreshToken !== "string" || !saved.refreshToken.startsWith("ghr_") ||
        !Number.isFinite(saved.expiresAt) || !Number.isFinite(saved.refreshExpiresAt))
      throw new GitHubError("GitHub 계정을 연결해 주세요.", 401);
    if (saved.expiresAt > Date.now() + 60000) return saved;
    if (saved.refreshExpiresAt <= Date.now()) throw new GitHubError("GitHub 인증이 만료되었습니다. 계정을 다시 연결해 주세요.", 401);
    const tokens = await refreshGitHubToken(config.clientId, (await readGitHubSecret("client")).trim(), saved.refreshToken);
    saved = { ...tokens, account: saved.account };
    await writeGitHubTokens(saved);
    return saved;
  });
}

export async function connectGitHubRepository(slug: string, url: unknown) {
  assertPersonalGitHubProject(slug);
  const project = await prisma.flowProject.findUnique({ where: { slug }, select: { slug: true } });
  if (!project) throw new GitHubError("개인 프로젝트를 찾지 못했습니다.", 404);
  const tokens = await currentTokens();
  const account = await getGitHubUser(tokens.accessToken);
  if (account.id !== tokens.account.id) throw new GitHubError("GitHub 계정을 다시 연결해 주세요.", 401);
  const repository = await verifyGitHubRepository(url, tokens.accessToken);
  return saveGitHubRepositoryLink(slug, account, repository);
}

/** GitHub 검증 결과만 저장한다. API 요청 본문을 이 함수로 직접 전달하지 않는다. */
export async function saveGitHubRepositoryLink(slug: string, account: Account, repository: GitHubRepository) {
  assertPersonalGitHubProject(slug);
  const value = { ...repository, accountId: account.id, accountLogin: account.login, verifiedAt: new Date().toISOString() };
  await withTokenLock(async tx => {
    if (!(await tx.flowProject.findUnique({ where: { slug }, select: { slug: true } })))
      throw new GitHubError("개인 프로젝트를 찾지 못했습니다.", 404);
    const current = await tx.appSetting.findUnique({ where: { key: ACCOUNT_KEY } });
    if ((current?.value as Account | null)?.id !== account.id) throw new GitHubError("연결 계정이 변경되었습니다. 다시 확인해 주세요.", 409);
    await tx.appSetting.upsert({ where: { key: linkKey(slug) }, create: { key: linkKey(slug), value }, update: { value } });
  });
  return value;
}

export async function unlinkGitHubRepository(slug: string) {
  assertPersonalGitHubProject(slug);
  await prisma.appSetting.deleteMany({ where: { key: linkKey(slug) } });
}

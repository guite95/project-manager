import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.ts";
import { isPersonalProject } from "../personal-projects.ts";
import { GitHubError, parseGitHubRepositoryUrl, validateGitHubCredential, type GitHubCredential, type GitHubRepositoryLink } from "../github.ts";
import { getGitHubUser, verifyGitHubRepository } from "./github-api.ts";
import { githubConfig } from "./github-config.ts";
import { readGitHubSecret, writeGitHubTokens } from "./github-secrets.ts";

type StoredCredential = GitHubCredential & { token: string };
type CredentialVault = { version: 1; credentials: StoredCredential[] };
type Transaction = Prisma.TransactionClient;
const linkKey = (slug: string) => `github:repository:${slug}`;

function assertPersonalProject(slug: string) {
  if (!isPersonalProject(slug)) throw new GitHubError("개인 프로젝트에만 GitHub 레포지토리를 연결할 수 있습니다.", 404);
}
function publicCredential(value: StoredCredential): GitHubCredential {
  return { id: value.id, label: value.label, accountId: value.accountId, accountLogin: value.accountLogin, expiresAt: value.expiresAt };
}
async function withTokenLock<T>(action: (tx: Transaction) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(71892345) IS NULL AS locked`;
    return action(tx);
  }, { timeout: 60000, maxWait: 10000 });
}

/** 외부 경계(GitHub API/Secret 서비스)를 분리하며 DB 검증·잠금은 공통으로 적용한다. */
export function createGitHubStore(dependencies = {
  configured: () => !!githubConfig(), readSecret: readGitHubSecret, writeSecret: writeGitHubTokens,
  getUser: getGitHubUser, verifyRepository: verifyGitHubRepository,
}) {
  async function readVault(): Promise<CredentialVault> {
    let value: CredentialVault;
    try { value = JSON.parse(await dependencies.readSecret()); }
    catch (error) {
      if (error instanceof GitHubError) throw error;
      throw new GitHubError("개인 토큰 보안 저장소를 읽지 못했습니다.", 503);
    }
    if (value && Object.keys(value).length === 0) return { version: 1, credentials: [] };
    if (!value || value.version !== 1 || !Array.isArray(value.credentials) || value.credentials.length > 10 ||
        value.credentials.some(c => !c || typeof c.id !== "string" || typeof c.label !== "string" ||
          !Number.isSafeInteger(c.accountId) || typeof c.accountLogin !== "string" || !Number.isFinite(c.expiresAt) ||
          typeof c.token !== "string" || !/^github_pat_[a-zA-Z0-9_]{20,250}$/.test(c.token)))
      throw new GitHubError("개인 토큰 보안 저장소 형식을 확인해 주세요. 기존 GitHub App 토큰은 사용할 수 없습니다.", 503);
    return value;
  }
  function requireConfigured() {
    if (!dependencies.configured()) throw new GitHubError("개인 토큰을 보관할 보안 저장소 설정이 필요합니다.", 503);
  }
  function findCredential(vault: CredentialVault, id: unknown) {
    const credential = vault.credentials.find(c => c.id === id);
    if (!credential || credential.expiresAt <= Date.now()) throw new GitHubError("사용 가능한 개인 토큰을 등록하거나 선택해 주세요. 만료된 토큰은 다시 등록해야 합니다.", 401);
    return credential;
  }
  async function connectionStatus() {
    if (!dependencies.configured()) return { configured: false, credentials: [] };
    return { configured: true, credentials: (await readVault()).credentials.map(publicCredential) };
  }
  async function registerCredential(input: { label?: unknown; token?: unknown; expiresOn?: unknown }) {
    const validated = validateGitHubCredential(input);
    requireConfigured();
    const account = await dependencies.getUser(validated.token);
    const credential: StoredCredential = { id: randomUUID(), ...validated, accountId: account.id, accountLogin: account.login };
    await withTokenLock(async () => {
      const vault = await readVault();
      if (vault.credentials.length >= 10) throw new GitHubError("개인 토큰은 최대 10개까지 등록할 수 있습니다. 사용하지 않는 토큰을 삭제해 주세요.");
      if (vault.credentials.some(c => c.token === credential.token)) throw new GitHubError("이미 등록된 토큰입니다. 기존 토큰을 선택해 주세요.", 409);
      vault.credentials.push(credential);
      await dependencies.writeSecret(vault);
    });
    return publicCredential(credential);
  }
  async function removeCredential(id: string) {
    requireConfigured();
    await withTokenLock(async () => {
      const vault = await readVault();
      const next = vault.credentials.filter(c => c.id !== id);
      if (next.length === vault.credentials.length) return;
      await dependencies.writeSecret({ ...vault, credentials: next });
    });
  }
  async function loadRepository(slug: string): Promise<GitHubRepositoryLink | null> {
    assertPersonalProject(slug);
    const row = await prisma.appSetting.findUnique({ where: { key: linkKey(slug) } });
    return row ? row.value as unknown as GitHubRepositoryLink : null;
  }
  async function connectRepository(slug: string, url: unknown, credentialId: unknown) {
    assertPersonalProject(slug);
    const parsed = parseGitHubRepositoryUrl(url);
    if (!(await prisma.flowProject.findUnique({ where: { slug }, select: { slug: true } })))
      throw new GitHubError("개인 프로젝트를 찾지 못했습니다.", 404);
    requireConfigured();
    const credential = findCredential(await readVault(), credentialId);
    const account = await dependencies.getUser(credential.token);
    if (account.id !== credential.accountId) throw new GitHubError("개인 토큰의 계정을 다시 확인해 주세요.", 401);
    const repository = await dependencies.verifyRepository(parsed.url, credential.token);
    const value = { ...repository, credentialId: credential.id, accountId: account.id, accountLogin: account.login, verifiedAt: new Date().toISOString() };
    await withTokenLock(async tx => {
      const current = findCredential(await readVault(), credential.id);
      if (current.token !== credential.token || current.accountId !== credential.accountId)
        throw new GitHubError("확인 중에 토큰이 변경되었습니다. 다시 시도해 주세요.", 409);
      if (!(await tx.flowProject.findUnique({ where: { slug }, select: { slug: true } })))
        throw new GitHubError("개인 프로젝트를 찾지 못했습니다.", 404);
      await tx.appSetting.upsert({ where: { key: linkKey(slug) }, create: { key: linkKey(slug), value }, update: { value } });
    });
    return value;
  }
  async function unlinkRepository(slug: string) {
    assertPersonalProject(slug);
    await prisma.appSetting.deleteMany({ where: { key: linkKey(slug) } });
  }
  return { connectionStatus, registerCredential, removeCredential, loadRepository, connectRepository, unlinkRepository };
}
const store = createGitHubStore();
export const gitHubConnectionStatus = store.connectionStatus;
export const registerGitHubCredential = store.registerCredential;
export const removeGitHubCredential = store.removeCredential;
export const loadGitHubRepository = store.loadRepository;
export const connectGitHubRepository = store.connectRepository;
export const unlinkGitHubRepository = store.unlinkRepository;

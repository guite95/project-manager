import { GitHubError } from "../github.ts";

export function githubConfig() {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const slug = process.env.GITHUB_APP_SLUG;
  const baseUrl = process.env.GITHUB_APP_BASE_URL;
  const region = process.env.OCI_GITHUB_REGION;
  const clientSecretId = process.env.OCI_GITHUB_CLIENT_SECRET_ID;
  const tokenSecretId = process.env.OCI_GITHUB_TOKEN_SECRET_ID;
  if (!clientId || !slug || !baseUrl || !region || !clientSecretId || !tokenSecretId) return null;
  let origin: URL;
  try { origin = new URL(baseUrl); } catch { return null; }
  if (!/^[a-zA-Z0-9_.-]+$/.test(clientId) || !/^[a-z0-9-]+$/.test(slug) ||
      origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
      !(origin.protocol === "https:" || (process.env.NODE_ENV !== "production" && origin.protocol === "http:" && ["localhost","127.0.0.1"].includes(origin.hostname))) ||
      !/^[a-z]+-[a-z0-9]+-\d+$/.test(region) ||
      !clientSecretId.startsWith("ocid1.vaultsecret.") || !tokenSecretId.startsWith("ocid1.vaultsecret.") || clientSecretId === tokenSecretId) return null;
  return { clientId, region, clientSecretId, tokenSecretId, origin: origin.origin,
    callbackUrl: `${origin.origin}/api/github/callback`, installationUrl: `https://github.com/apps/${slug}/installations/new` };
}

export function requireGitHubConfig() {
  const config = githubConfig();
  if (!config) throw new GitHubError("GitHub 연동 프로그램의 최초 설정이 필요합니다.", 503);
  return config;
}

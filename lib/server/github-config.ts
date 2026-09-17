import { GitHubError } from "../github.ts";

export function githubConfig() {
  const region = process.env.OCI_GITHUB_REGION;
  const tokenSecretId = process.env.OCI_GITHUB_TOKEN_SECRET_ID;
  if (!region || !/^[a-z]+-[a-z0-9]+-\d+$/.test(region) || !tokenSecretId?.startsWith("ocid1.vaultsecret.")) return null;
  return { region, tokenSecretId };
}

export function requireGitHubConfig() {
  const config = githubConfig();
  if (!config) throw new GitHubError("개인 토큰을 보관할 보안 저장소 설정이 필요합니다.", 503);
  return config;
}

import { GitHubError } from "../github.ts";
import { requireGitHubConfig } from "./github-config.ts";

async function clients() {
  const config = requireGitHubConfig();
  const common = await import("oci-common");
  const { SecretsClient } = await import("oci-secrets");
  const { VaultsClient } = await import("oci-vault");
  const auth = process.env.OCI_GITHUB_AUTH ?? (process.env.NODE_ENV === "production" ? "instance_principal" : "config_file");
  const authenticationDetailsProvider = auth === "instance_principal"
    ? await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build()
    : auth === "config_file" && process.env.NODE_ENV !== "production"
      ? new common.ConfigFileAuthenticationDetailsProvider(process.env.OCI_CONFIG_FILE, process.env.OCI_CONFIG_PROFILE ?? "DEFAULT")
      : null;
  if (!authenticationDetailsProvider) throw new GitHubError("GitHub 보안 저장소 인증 설정을 확인해 주세요.", 503);
  const secrets = new SecretsClient({ authenticationDetailsProvider });
  const vault = new VaultsClient({ authenticationDetailsProvider });
  secrets.regionId = config.region;
  vault.regionId = config.region;
  return { secrets, vault };
}

export async function readGitHubSecret(kind: "client" | "tokens"): Promise<string> {
  try {
    const config = requireGitHubConfig();
    const { secrets } = await clients();
    const response = await secrets.getSecretBundle({ secretId: kind === "client" ? config.clientSecretId : config.tokenSecretId });
    const bundle = response.secretBundle.secretBundleContent;
    if (!bundle || bundle.contentType !== "BASE64" || !("content" in bundle) || typeof bundle.content !== "string") throw new Error();
    return Buffer.from(bundle.content, "base64").toString("utf8");
  } catch { throw new GitHubError("GitHub 보안 저장소를 읽지 못했습니다. 최초 설정과 접근 권한을 확인해 주세요.", 503); }
}

export async function writeGitHubTokens(value: object) {
  try {
    const { vault } = await clients();
    const secretId = requireGitHubConfig().tokenSecretId;
    const current = await vault.getSecret({ secretId });
    await vault.updateSecret({ secretId, ifMatch: current.etag, updateSecretDetails: {
      secretContent: { contentType: "BASE64", content: Buffer.from(JSON.stringify(value)).toString("base64") },
    } });
  } catch { throw new GitHubError("GitHub 인증 정보를 안전하게 저장하지 못했습니다. 다시 연결해 주세요.", 503); }
}

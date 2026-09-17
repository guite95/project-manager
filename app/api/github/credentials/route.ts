import { githubJson, readGitHubCredentialBody } from "@/lib/server/github-http";
import { registerGitHubCredential } from "@/lib/server/github-store";

export async function POST(request: Request) {
  return githubJson(request, async () => {
    const body = await readGitHubCredentialBody(request);
    return { credential: await registerGitHubCredential({ label: body.label, token: body.token, expiresOn: body.expiresOn }) };
  }, true);
}

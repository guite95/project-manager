import { githubJson } from "@/lib/server/github-http";
import { removeGitHubCredential } from "@/lib/server/github-store";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return githubJson(request, async () => {
    await removeGitHubCredential((await context.params).id);
    return { removed: true };
  }, true);
}

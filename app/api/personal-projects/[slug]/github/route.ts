import { readJson } from "@/lib/api-types";
import { githubJson } from "@/lib/server/github-http";
import { connectGitHubRepository, loadGitHubRepository, unlinkGitHubRepository } from "@/lib/server/github-store";

type Context = { params: Promise<{ slug: string }> };
export async function GET(request: Request, context: Context) {
  return githubJson(request, async () => ({ repository: await loadGitHubRepository((await context.params).slug) }));
}
export async function PUT(request: Request, context: Context) {
  return githubJson(request, async () => {
    const body = await readJson(request);
    return { repository: await connectGitHubRepository((await context.params).slug, body.url) };
  }, true);
}
export async function DELETE(request: Request, context: Context) {
  return githubJson(request, async () => {
    await unlinkGitHubRepository((await context.params).slug);
    return { repository: null };
  }, true);
}

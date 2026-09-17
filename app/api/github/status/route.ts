import { githubJson } from "@/lib/server/github-http";
import { gitHubConnectionStatus } from "@/lib/server/github-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return githubJson(request, gitHubConnectionStatus);
}

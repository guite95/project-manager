import { NextResponse } from "next/server";
import { beginGitHubAuthorization } from "@/lib/server/github-store";
import { githubErrorResponse, githubPrivateHeaders, requireGitHubSession } from "@/lib/server/github-http";

export async function POST(request: Request) {
  try {
    const session = await requireGitHubSession(request, true);
    const { url, verifier } = await beginGitHubAuthorization(session);
    const response = NextResponse.json({ url }, { headers: githubPrivateHeaders });
    response.cookies.set("pm_github_verifier", verifier, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/github", maxAge: 600,
    });
    return response;
  } catch (error) { return githubErrorResponse(error); }
}

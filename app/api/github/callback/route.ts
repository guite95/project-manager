import { NextResponse } from "next/server";
import { completeGitHubAuthorization } from "@/lib/server/github-store";
import { githubPrivateHeaders, requestCookie, requireGitHubSession } from "@/lib/server/github-http";
import { githubConfig } from "@/lib/server/github-config";

export async function GET(request: Request) {
  let result = "error";
  try {
    const session = await requireGitHubSession(request);
    const params = new URL(request.url).searchParams;
    if (!params.has("error")) {
      await completeGitHubAuthorization(session, params.get("state") ?? "", params.get("code") ?? "", requestCookie(request, "pm_github_verifier"));
      result = "connected";
    } else result = "cancelled";
  } catch { /* 인증정보와 GitHub 응답 원문을 로그나 URL에 남기지 않는다. */ }
  const redirect = new URL(`/personal?github=${result}`, githubConfig()?.origin ?? new URL(request.url).origin);
  const response = NextResponse.redirect(redirect, { status: 303, headers: githubPrivateHeaders });
  response.cookies.set("pm_github_verifier", "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/github", maxAge: 0,
  });
  return response;
}

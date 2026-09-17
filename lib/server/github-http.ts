import { isSessionTokenValid, SESSION_COOKIE_NAME } from "../session.ts";
import { GitHubError } from "../github.ts";
import { githubConfig } from "./github-config.ts";

export const githubPrivateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export function requestCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export async function requireGitHubSession(request: Request, write = false) {
  const token = requestCookie(request, SESSION_COOKIE_NAME);
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token || !(await isSessionTokenValid(token, secret, Date.now())))
    throw new GitHubError("로그인 후 GitHub를 연결해 주세요.", 401);
  if (write) {
    const origin = githubConfig()?.origin ?? new URL(request.url).origin;
    if (request.headers.get("origin") !== origin)
      throw new GitHubError("요청 출처를 확인하지 못했습니다. 페이지를 새로고침해 주세요.", 403);
  }
  return token;
}

export async function githubJson(request: Request, action: () => Promise<unknown>, write = false) {
  try {
    await requireGitHubSession(request, write);
    return Response.json(await action(), { headers: githubPrivateHeaders });
  } catch (error) {
    return githubErrorResponse(error);
  }
}

export function githubErrorResponse(error: unknown) {
  return Response.json({ message: error instanceof GitHubError ? error.message : "GitHub 연결을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, {
    status: error instanceof GitHubError ? error.status : 500, headers: githubPrivateHeaders,
  });
}

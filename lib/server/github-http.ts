import { isSessionTokenValid, SESSION_COOKIE_NAME } from "../session.ts";
import { GitHubError } from "../github.ts";

export const githubPrivateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/** 토큰 입력은 작은 JSON 본문만 허용하고 파싱 오류에 원문을 포함하지 않는다. */
export async function readGitHubCredentialBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new GitHubError("JSON 요청이 필요합니다.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new GitHubError("토큰 정보를 입력해 주세요.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new GitHubError("요청 본문이 너무 큽니다.", 413); }
      chunks.push(value);
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    return input as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    throw new GitHubError("토큰 입력 형식을 확인해 주세요.");
  } finally { reader.releaseLock(); }
}

export function requestCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export async function requireGitHubSession(request: Request, write = false) {
  const token = requestCookie(request, SESSION_COOKIE_NAME);
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token || !(await isSessionTokenValid(token, secret, Date.now())))
    throw new GitHubError("로그인 후 GitHub를 연결해 주세요.", 401);
  if (write) {
    const origin = process.env.GITHUB_ALLOWED_ORIGIN || new URL(request.url).origin;
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

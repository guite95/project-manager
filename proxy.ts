import { NextResponse, type NextRequest } from "next/server";
import { isSessionTokenValid, SESSION_COOKIE_NAME } from "@/lib/session";

/**
 * 세션 검사. Next 16 부터 `middleware` 대신 `proxy` 규약을 쓴다.
 *
 * 비밀번호 해시가 아니라 서명만 검사하므로 Web Crypto 만 쓰는 `lib/session.ts` 를
 * 부른다. DB 는 건드리지 않는다.
 */

/** 세션 없이도 열려야 하는 경로. */
const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

/**
 * 개발 환경에서는 비밀번호를 묻지 않는다. 로그인 흐름 자체를 확인하고 싶으면
 * `REQUIRE_LOGIN=1` 로 켠다. 프로덕션 빌드에서는 이 스위치와 무관하게 항상 막는다.
 */
const REQUIRE_LOGIN =
  process.env.NODE_ENV === "production" || process.env.REQUIRE_LOGIN === "1";

export async function proxy(request: NextRequest) {
  if (!REQUIRE_LOGIN) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // 외부 서비스 연동을 붙일 자리. 지금은 토큰을 발급하지 않으므로 항상 건너뛴다.
  // 연동을 붙일 때 여기서 Authorization 헤더를 검사한다.

  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const ok =
    Boolean(secret) && (await isSessionTokenValid(token, secret!, Date.now()));
  if (ok) return NextResponse.next();

  // API 요청에 로그인 화면 HTML 을 돌려주면 fetch 쪽이 헷갈린다. 401 로 끊는다.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // 정적 파일과 이미지 최적화 경로는 검사하지 않는다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

/** 공개 포트폴리오의 정확한 조회 경로만 세션 없이 허용한다. */
export function isPublicPortfolioRead(path: string, method: string): boolean {
  return path === '/portfolio/show' && (method === 'GET' || method === 'HEAD');
}

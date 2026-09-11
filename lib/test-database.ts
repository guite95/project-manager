/** Destructive test helpers are deliberately limited to the local PostgreSQL test DB. */
export function assertTestDatabase(value: string | undefined): void {
  if (!value) throw new Error('TEST_DATABASE_URL이 없습니다.');
  const url = new URL(value);
  if (!['postgresql:','postgres:'].includes(url.protocol) ||
      !['localhost','127.0.0.1','[::1]'].includes(url.hostname) ||
      (url.port && url.port !== '5432') ||
      decodeURIComponent(url.pathname) !== '/project_management_test' ||
      url.searchParams.has('host') || url.searchParams.has('port') ||
      process.env.SHARED_DATABASE === '1') {
    throw new Error('테스트는 로컬 5432의 project_management_test DB에서만 실행할 수 있습니다.');
  }
}

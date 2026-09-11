export function tunnelDatabaseUrl(source: string, port: number): string {
  const url = new URL(source);
  if(!['postgresql:','postgres:'].includes(url.protocol) ||
     decodeURIComponent(url.pathname) !== '/project_management' ||
     ['host','hostaddr','port'].some(key=>url.searchParams.has(key)) ||
     !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('공유 DB 연결 대상이 올바르지 않습니다.');
  }
  url.hostname = '127.0.0.1'; url.port = String(port);
  return url.toString();
}

#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { prisma } from '../lib/db.ts';
import { inspectTnsErdLayouts, initializeTnsErdLayouts } from '../lib/server/erd-layout-store.ts';

try {
  const {values,positionals} = parseArgs({allowPositionals:true,options:{expect:{type:'string'},'backup-dir':{type:'string'}}});
  if (positionals.length !== 1 || !['inspect','apply'].includes(positionals[0])) throw new Error('inspect 또는 apply 명령이 필요합니다.');
  const result = positionals[0] === 'inspect' ? await inspectTnsErdLayouts()
    : await initializeTnsErdLayouts(values.expect ?? '',values['backup-dir'] ?? join(homedir(),'pm-backups'));
  console.log(JSON.stringify(result));
} catch (error) {
  // 드라이버 예외에는 접속 정보가 포함될 수 있으므로 전체 오류를 출력하지 않는다.
  console.error(error?.name === 'Error' ? error.message : 'ERD 배치 명령이 실패했습니다. 접속 상태와 검사 토큰을 확인하세요.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }

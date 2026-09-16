import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const keys = ['SHARED_DB_SSH_HOST', 'SHARED_DB_SSH_USER', 'SHARED_DB_SSH_PORT', 'SHARED_DB_SSH_KEY', 'SHARED_DB_REMOTE_PORT'];
export async function readFlowSshConfig(env = process.env) {
  const path = env.PM_FLOW_SSH_CONFIG || join(homedir(), '.config/pm-flow/ssh.env');
  let contents;
  try { contents = await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT' && !env.PM_FLOW_SSH_CONFIG) return {}; throw new Error('CLI SSH 설정 파일을 읽을 수 없습니다. PM_FLOW_SSH_CONFIG 경로를 확인하세요.'); }
  const values = parseEnv(contents);
  return Object.fromEntries(keys.filter(key => values[key] !== undefined && env[key] === undefined).map(key => [key, values[key]]));
}

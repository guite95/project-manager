import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';

const MAX_TOKEN_BYTES = 16 * 1024;

async function readToken(path) {
  let file;
  try {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error();
    // O_NONBLOCK also prevents a replaced FIFO from hanging before fstat.
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o022) || stat.size > MAX_TOKEN_BYTES) throw new Error();
    const buffer = Buffer.alloc(MAX_TOKEN_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_TOKEN_BYTES) throw new Error();
    const value = JSON.parse(buffer.subarray(0, length).toString('utf8'));
    if (typeof value?.access_token !== 'string' || !/^[A-Za-z0-9._~+/-]+=*$/.test(value.access_token) ||
        !Number.isSafeInteger(value.expiry_date) || value.expiry_date < Date.now() + 30_000) throw new Error();
    return value;
  } catch {
    throw new Error('GOOGLE_RUNTIME_TOKEN_UNAVAILABLE');
  } finally { await file?.close(); }
}

// OAuth2Client supplies the installed SDK contract; only file reads supply credentials.
// Do not set refresh_token/refreshHandler or cache bearer credentials on this client.
class FileTokenAuth extends OAuth2Client {
  #path;
  constructor(path) { super(); this.#path = path; }
  async getAccessTokenAsync() { return { token: (await readToken(this.#path)).access_token }; }
  async getRequestMetadataAsync() {
    const { access_token } = await readToken(this.#path);
    return { headers: new Headers({ authorization: `Bearer ${access_token}` }) };
  }
  async requestAsync(options) {
    try {
      return await super.requestAsync({ ...options, retry: false, maxRedirects: 0 });
    } catch (cause) {
      if (cause?.message === 'GOOGLE_RUNTIME_TOKEN_UNAVAILABLE') throw new Error('GOOGLE_RUNTIME_TOKEN_UNAVAILABLE');
      const error = new Error('GOOGLE_RUNTIME_REQUEST_FAILED');
      // Chirp relies on 404/412; retain status only, never SDK config/body/headers/cause.
      const status = cause?.response?.status;
      if (Number.isInteger(status) && status >= 400 && status <= 599) error.response = { status };
      throw error;
    }
  }
}

export function createGoogleRuntimeAuth(env = process.env) {
  return env.GOOGLE_ACCESS_TOKEN_FILE !== undefined
    ? new FileTokenAuth(env.GOOGLE_ACCESS_TOKEN_FILE)
    : new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
}

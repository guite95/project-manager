import { createHash } from 'node:crypto';

export const MAX_OBJECT_BYTES = 16 * 1024 * 1024;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function storageConfig() {
  const region = process.env.OCI_STORAGE_REGION;
  const namespace = process.env.OCI_STORAGE_NAMESPACE;
  const bucket = process.env.OCI_STORAGE_BUCKET;
  if (!region && !namespace && !bucket) return null;
  if (!region || !/^[a-z]+-[a-z0-9]+-\d+$/.test(region) || !namespace || !/^[a-zA-Z0-9_-]+$/.test(namespace) || !bucket || !/^[a-zA-Z0-9_.-]+$/.test(bucket)) throw new Error('OCI 저장소 설정이 올바르지 않습니다.');
  return { region, namespace, bucket };
}
let clientPromise;
export class ObjectCleanupRequiredError extends Error {
  constructor(storage) {
    super('업로드 실패 객체를 정리 작업으로 기록해야 합니다.');
    this.storage = storage;
  }
}
async function client() {
  if (!clientPromise) clientPromise = (async () => {
    const mode = process.env.OCI_STORAGE_AUTH ?? (process.env.NODE_ENV === 'production' ? 'instance_principal' : 'config_file');
    if (mode === 'broker') {
      const { createObjectBrokerClient } = await import('./object-storage-broker-client.mjs');
      return createObjectBrokerClient(process.env.OCI_STORAGE_BROKER_SOCKET);
    }
    const common = await import('oci-common');
    const { ObjectStorageClient } = await import('oci-objectstorage');
    let authenticationDetailsProvider;
    if (mode === 'instance_principal') authenticationDetailsProvider = await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
    else if (mode === 'config_file' && process.env.NODE_ENV !== 'production') authenticationDetailsProvider = new common.ConfigFileAuthenticationDetailsProvider(process.env.OCI_CONFIG_FILE, process.env.OCI_CONFIG_PROFILE ?? 'DEFAULT');
    else throw new Error('OCI 저장소 인증 방식이 올바르지 않습니다.');
    const c = new ObjectStorageClient({ authenticationDetailsProvider });
    c.regionId = storageConfig().region;
    return c;
  })().catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}
export function validateReference(ref, project, slug, scope = 'materials') {
  const maximum = objectLimit(scope);
  const config = storageConfig();
  if (!config || !ref || ref.provider !== 'oci' || ref.version !== 1 ||
      ref.region !== config.region || ref.namespace !== config.namespace || ref.bucket !== config.bucket ||
      !/^[a-f0-9]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > maximum ||
      ref.key !== `${scope}/${encodeURIComponent(project)}/${encodeURIComponent(slug)}/${ref.sha256}`) throw new Error('자료 저장소 참조가 올바르지 않습니다.');
  return ref;
}
export async function readObject(ref, project, slug, scope = 'materials') {
  validateReference(ref, project, slug, scope);
  const c = await client();
  const response = await c.getObject({ namespaceName: ref.namespace, bucketName: ref.bucket, objectName: ref.key,
    brokerReference: { scope, project, slug, sha256: ref.sha256, bytes: ref.bytes } });
  return verifiedObjectBytes(response, ref);
}
export async function verifiedObjectBytes(response, ref) {
  if (response.contentLength !== ref.bytes) {
    response.value.destroy?.();
    await response.value.cancel?.();
    throw new Error('자료 크기가 일치하지 않습니다.');
  }
  const chunks = [];
  let length = 0;
  const stream = response.value;
  // SDK의 Node 스트림과 Web 스트림을 모두 처리한다.
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > ref.bytes) throw new Error('자료 크기가 일치하지 않습니다.');
      chunks.push(bytes);
    }
  } finally { if (length > ref.bytes) stream.destroy?.(); }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== ref.bytes || sha256(bytes) !== ref.sha256) throw new Error('자료 무결성 검증에 실패했습니다.');
  return bytes;
}
function objectLimit(scope) {
  if (scope === 'recordings') return 100 * 1024 * 1024;
  if (scope === 'materials') return MAX_OBJECT_BYTES;
  throw new Error('저장소 경로가 올바르지 않습니다.');
}
export async function putObjectWithStatus(bytes, project, slug, contentType, scope = 'materials') {
  const config = storageConfig();
  if (!config || !bytes.length || bytes.length > objectLimit(scope)) throw new Error('OCI 자료 저장 설정 또는 크기가 올바르지 않습니다.');
  const hash = sha256(bytes);
  const ref = { provider: 'oci', version: 1, ...config, key: `${scope}/${encodeURIComponent(project)}/${encodeURIComponent(slug)}/${hash}`, sha256: hash, bytes: bytes.length };
  const c = await client();
  let created = true;
  try {
    await c.putObject({ namespaceName: config.namespace, bucketName: config.bucket, objectName: ref.key,
      brokerReference: { scope, project, slug, sha256: hash, bytes: bytes.length },
      putObjectBody: bytes, contentLength: bytes.length, contentType, ifNoneMatch: '*',
      contentMD5: createHash('md5').update(bytes).digest('base64') });
  } catch (error) {
    if (error.statusCode !== 412) throw new Error('OCI 자료 업로드에 실패했습니다.');
    created = false;
  }
  try { await readObject(ref, project, slug, scope); }
  catch (error) {
    if (created) {
      try { await deleteObject(ref, project, slug, scope); }
      catch { throw new ObjectCleanupRequiredError(ref); }
    }
    throw error;
  }
  return { ref, created };
}
export async function putObject(bytes, project, slug, contentType, scope = 'materials') {
  return (await putObjectWithStatus(bytes, project, slug, contentType, scope)).ref;
}
export async function deleteObject(ref, project, slug, scope = 'materials') {
  validateReference(ref, project, slug, scope);
  try {
    await (await client()).deleteObject({ namespaceName: ref.namespace, bucketName: ref.bucket, objectName: ref.key,
      brokerReference: { scope, project, slug, sha256: ref.sha256, bytes: ref.bytes } });
  } catch (error) { if (error.statusCode !== 404) throw new Error('OCI 자료 삭제에 실패했습니다.'); }
}

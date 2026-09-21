// Both ends validate. Host configuration, never request data, selects the OCI bucket.
export const BROKER_ROUTE = '/v1/objects/';
export function validateBrokerReference(ref) {
  if (!ref || Object.keys(ref).sort().join(',') !== 'bytes,project,scope,sha256,slug') throw new Error('OBJECT_BROKER_REFERENCE');
  const limit = ref.scope === 'materials' ? 16 * 1024 * 1024 : ref.scope === 'recordings' ? 100 * 1024 * 1024 : 0;
  for (const id of [ref.project, ref.slug]) {
    if (typeof id !== 'string' || !id.length || id.length > 256 || id === '.' || id === '..' || /[\\/%\p{Cc}]/u.test(id)) throw new Error('OBJECT_BROKER_REFERENCE');
  }
  if (typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > limit) throw new Error('OBJECT_BROKER_REFERENCE');
  return `${ref.scope}/${encodeURIComponent(ref.project)}/${encodeURIComponent(ref.slug)}/${ref.sha256}`;
}

export function brokerRoute(ref) {
  validateBrokerReference(ref);
  return BROKER_ROUTE + Buffer.from(JSON.stringify(ref)).toString('base64url');
}

export function parseBrokerRoute(route) {
  if (typeof route !== 'string' || route.length > 8192 || !route.startsWith(BROKER_ROUTE)) throw new Error('OBJECT_BROKER_REFERENCE');
  const encoded = route.slice(BROKER_ROUTE.length);
  if (!/^[a-zA-Z0-9_-]+$/.test(encoded)) throw new Error('OBJECT_BROKER_REFERENCE');
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.toString('base64url') !== encoded) throw new Error('OBJECT_BROKER_REFERENCE');
  let ref;
  try { ref = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('OBJECT_BROKER_REFERENCE'); }
  validateBrokerReference(ref);
  return ref;
}

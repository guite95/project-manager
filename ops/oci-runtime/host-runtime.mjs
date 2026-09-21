import { chmod, lstat } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createObjectBrokerServer } from './object-broker.mjs';

export async function startObjectBroker({ socketPath, config, store }) {
  let server;
  try {
    if (typeof socketPath !== 'string' || !isAbsolute(socketPath)) throw new Error();
    const parent = await lstat(dirname(socketPath));
    if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid() || (parent.mode & 0o022)) throw new Error();
    const existing = await lstat(socketPath).catch(e => { if (e.code !== 'ENOENT') throw e; });
    // Even stale sockets require operator inspection, never automatic replacement.
    if (existing) throw new Error();
    server = createObjectBrokerServer({ config, store });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
    await chmod(socketPath, 0o660);
    let closing;
    const close = () => closing ??= new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    return { server, close };
  } catch {
    server?.close(); server?.closeAllConnections();
    throw new Error('OBJECT_BROKER_START_FAILED');
  }
}

export async function createOciObjectStore({ authenticationDetailsProvider, region }) {
  if (!/^[a-z]+-[a-z0-9]+-\d+$/.test(region ?? '')) throw new Error('OBJECT_BROKER_CONFIGURATION');
  const common = await import('oci-common');
  const { ObjectStorageClient } = await import('oci-objectstorage');
  return Object.fromEntries(['getObject', 'putObject', 'deleteObject'].map(method => [method, async ({ abortSignal, ...request }) => {
    // A per-request client carries its own abort signal; identity provider is shared.
    const signer = authenticationDetailsProvider ? new common.DefaultRequestSigner(authenticationDetailsProvider) : null;
    const transport = new common.FetchHttpClient(signer, null, { signal: abortSignal, redirect: 'error' });
    const httpClient = { send: async (...args) => {
      try {
        const response = await transport.send(...args);
        if (response.status >= 200 && response.status < 300) return response;
        // The SDK retrier logs error messages before throwing. Discard the body
        // before it reaches that layer; also bound untrusted error-body memory.
        response.body?.destroy?.();
        await response.body?.cancel?.();
        return new Response(JSON.stringify({ code: 'ObjectBrokerUpstream', message: 'OBJECT_STORAGE_UNAVAILABLE' }), {
          status: response.status, headers: { 'Content-Type': 'application/json' },
        });
      } catch { throw new Error('OBJECT_STORAGE_UNAVAILABLE'); }
    } };
    const client = new ObjectStorageClient({ authenticationDetailsProvider, httpClient }, {
      retryConfiguration: common.NoRetryConfigurationDetails,
    });
    client.regionId = region;
    return client[method](request);
  }]));
}

async function main() {
  const config = { region: process.env.OCI_STORAGE_REGION, namespace: process.env.OCI_STORAGE_NAMESPACE, bucket: process.env.OCI_STORAGE_BUCKET };
  const common = await import('oci-common');
  const authenticationDetailsProvider = await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
  const store = await createOciObjectStore({ authenticationDetailsProvider, region: config.region });
  const runtime = await startObjectBroker({ config, store, socketPath: '/run/project-management-broker/storage.sock' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await runtime.close(); process.exit(0); });
  runtime.server.on('error', () => { process.stderr.write('OBJECT_BROKER_RUNTIME_FAILED\n'); process.exit(1); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('OBJECT_BROKER_START_FAILED\n'); process.exitCode = 1; });
}

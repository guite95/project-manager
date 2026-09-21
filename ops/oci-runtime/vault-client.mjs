export async function createVaultClient({ authenticationDetailsProvider, region }) {
  if (!/^[a-z]+-[a-z0-9]+-\d+$/.test(region ?? '')) throw new Error('VAULT_CONFIGURATION');
  const common = await import('oci-common');
  const { SecretsClient } = await import('oci-secrets');
  return { async getSecretBundle({ secretId, versionNumber }) {
    try {
      if (!/^ocid1\.vaultsecret\.oc1\.[a-z]+-[a-z0-9]+-\d+\.[A-Za-z0-9]+$/.test(secretId ?? '')
        || !Number.isSafeInteger(versionNumber) || versionNumber < 1) throw new Error();
      const signer = authenticationDetailsProvider ? new common.DefaultRequestSigner(authenticationDetailsProvider) : null;
      const transport = new common.FetchHttpClient(signer, null, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
      const httpClient = { async send(...args) {
        try {
          const response = await transport.send(...args);
          if (response.status !== 200) {
            response.body?.destroy?.(); await response.body?.cancel?.();
            return new Response(JSON.stringify({ code: 'VaultUnavailable', message: 'VAULT_BUNDLE_UNAVAILABLE' }), {
              status: response.status, headers: { 'Content-Type': 'application/json' },
            });
          }
          const chunks = []; let length = 0;
          try {
            for await (const chunk of response.body) {
              length += chunk.length;
              if (length > 131072) throw new Error();
              chunks.push(Buffer.from(chunk));
            }
            return new Response(Buffer.concat(chunks), { status: 200, headers: response.headers });
          } finally { for (const chunk of chunks) chunk.fill(0); }
        } catch { throw new Error('VAULT_BUNDLE_UNAVAILABLE'); }
      } };
      const client = new SecretsClient({ authenticationDetailsProvider, httpClient }, { retryConfiguration: common.NoRetryConfigurationDetails });
      client.regionId = region;
      return await client.getSecretBundle({ secretId, versionNumber });
    } catch { throw new Error('VAULT_BUNDLE_UNAVAILABLE'); }
  } };
}

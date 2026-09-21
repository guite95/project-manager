import test from 'node:test';
import assert from 'node:assert/strict';
import { createVaultClient } from './vault-client.mjs';

test('real OCI SDK uses only the pinned bundle version, bounded transport and sanitized failures', async t => {
  const fetch = globalThis.fetch, warn = console.warn;
  const warnings = []; console.warn = (...args) => warnings.push(args.join(' '));
  t.after(() => { globalThis.fetch = fetch; console.warn = warn; });
  let calls = 0, failure = false, oversized = false;
  const secretId = 'ocid1.vaultsecret.oc1.ap-chuncheon-1.fixture';
  globalThis.fetch = async (url, options) => {
    calls++;
    const target = new URL(String(url));
    assert.equal(target.hostname, 'secrets.vaults.ap-chuncheon-1.oci.oraclecloud.com');
    assert.equal(target.pathname, `/20190301/secretbundles/${secretId}`);
    assert.equal(target.searchParams.get('versionNumber'), '2');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    if (failure) return new Response(JSON.stringify({ code: 'BadRequest', message: 'SENSITIVE_FIXTURE' }), { status: 400 });
    if (oversized) return new Response('x'.repeat(131073));
    return new Response(JSON.stringify({ secretId, versionNumber: 2, stages: ['CURRENT'], secretBundleContent: { contentType: 'BASE64', content: 'Zml4dHVyZQ==' } }), { headers: { 'Content-Type': 'application/json' } });
  };
  const client = await createVaultClient({ authenticationDetailsProvider: null, region: 'ap-chuncheon-1' });
  const response = await client.getSecretBundle({ secretId, versionNumber: 2 });
  assert.equal(response.secretBundle.versionNumber, 2);
  failure = true;
  await assert.rejects(client.getSecretBundle({ secretId, versionNumber: 2 }), { message: 'VAULT_BUNDLE_UNAVAILABLE' });
  assert.equal(calls, 2); assert.ok(!warnings.join('\n').includes('SENSITIVE_FIXTURE'));
  failure = false; oversized = true;
  await assert.rejects(client.getSecretBundle({ secretId, versionNumber: 2 }), { message: 'VAULT_BUNDLE_UNAVAILABLE' });
  assert.equal(calls, 3);
});

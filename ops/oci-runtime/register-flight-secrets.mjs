import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { isMainModule } from '../../lib/server/cli-entry.mjs';
import { readCredentialInput } from './credential-input.mjs';

export function buildFlightSecretEntries(input, existing) {
  try {
    const url=new URL(existing.DATABASE_URL);
    if(!['postgresql:','postgres:'].includes(url.protocol)||decodeURIComponent(url.pathname)!=='/flight-db'
      ||['host','hostaddr','port'].some(k=>url.searchParams.has(k)))throw new Error();
    const retained={
      SECRET_KEY:input.application_signing_secrets.flight_session.new_secret,
      SMTP_PASSWORD:input.external_reissuance.flight_smtp.new_password,
      KAKAO_CLIENT_SECRET:input.external_reissuance.flight_kakao_client.new_secret,
    };
    if(Object.entries(retained).some(([k,v])=>!v||v!==existing[k]))throw new Error();
    const google=JSON.parse(existing.GOOGLE_CLIENT_CONFIG);
    if(google.web?.client_secret!==input.external_reissuance.flight_google_oauth_client.new_secret||!existing.KAKAO_REST_API_KEY)throw new Error();
    const urls={};
    for(const kind of ['runtime','migration']){
      const account=input.service_accounts['flight_postgres_'+kind];
      if(!account?.new_username||!account.new_password)throw new Error();
      const updated=new URL(url);updated.username=encodeURIComponent(account.new_username);updated.password=encodeURIComponent(account.new_password);
      urls[kind]=updated.toString();
    }
    return [
      {name:'flight-runtime-config',value:JSON.stringify({DATABASE_URL:urls.runtime,...retained,KAKAO_REST_API_KEY:existing.KAKAO_REST_API_KEY,GOOGLE_CLIENT_CONFIG:existing.GOOGLE_CLIENT_CONFIG})},
      {name:'flight-migration-database-url',value:urls.migration},
    ];
  }catch{throw new Error('FLIGHT_SECRET_REGISTRATION_INPUT_INVALID');}
}

const register = String.raw`
import sys,json,base64,oci
try:
 payload=json.load(sys.stdin)
 resources=payload['resources']
 config=oci.config.from_file(); config['region']=resources['region']
 vault=oci.vault.VaultsClient(config,retry_strategy=oci.retry.NoneRetryStrategy(),timeout=(10,30))
 bundles=oci.secrets.SecretsClient(config,retry_strategy=oci.retry.NoneRetryStrategy(),timeout=(10,30))
 listed=oci.pagination.list_call_get_all_results(vault.list_secrets,compartment_id=resources['compartmentId']).data
 results=[]
 for entry in payload['entries']:
  existing=[s for s in listed if s.secret_name==entry['name']]
  if len(existing)>1: raise RuntimeError()
  if existing:
   secret=existing[0]
   if secret.vault_id != resources['vaultId'] or secret.lifecycle_state!='ACTIVE': raise RuntimeError()
   created=False
  else:
   content=oci.vault.models.Base64SecretContentDetails(content=base64.b64encode(entry['value'].encode()).decode(),stage='CURRENT')
   details=oci.vault.models.CreateSecretDetails(compartment_id=resources['compartmentId'],vault_id=resources['vaultId'],key_id=resources['keyId'],secret_name=entry['name'],secret_content=content)
   secret=vault.create_secret(details).data
   created=True
   secret=oci.wait_until(vault,vault.get_secret(secret.id),'lifecycle_state','ACTIVE',max_interval_seconds=3,max_wait_seconds=90).data
  bundle=bundles.get_secret_bundle(secret.id,version_number=1).data
  if bundle.version_number!=1 or 'CURRENT' not in bundle.stages or base64.b64decode(bundle.secret_bundle_content.content).decode()!=entry['value']: raise RuntimeError()
  results.append({'name':entry['name'],'id':secret.id,'versionNumber':1,'created':created})
 print(json.dumps({'ok':True,'secrets':results,'vm_iam_granted':False,'database_accounts_changed':False}))
except Exception:
 print(json.dumps({'ok':False,'code':'FLIGHT_VAULT_REGISTRATION_FAILED','partial_creations_may_exist':True}))
 sys.exit(1)
`;

async function main() {
  const mode = process.argv[2] ?? '--check';
  if (!['--check', '--apply'].includes(mode) || process.argv.length > 3) throw new Error();
  const { credentials, report } = await readCredentialInput('.private/oci-vault-credentials.json');
  if (!report.ok) throw new Error();
  const remote = String.raw`docker exec flight-backend python -c 'import os,json,sys; names=["DATABASE_URL","SECRET_KEY","SMTP_PASSWORD","KAKAO_CLIENT_SECRET","KAKAO_REST_API_KEY","GOOGLE_CLIENT_CONFIG"]; assert "FLIGHT_SECRET_DIRECTORY" not in os.environ; sys.stdout.write(json.dumps({k:os.environ[k] for k in names}))'`;
  // SSH stdout remains in this operator process; never relay the captured environment.
  const existing = JSON.parse(execFileSync('python3', [`${process.env.HOME}/.codex/skills/oci-ssh/scripts/oci_ssh.py`, '--command', remote], { encoding: 'utf8', timeout: 20000, maxBuffer: 32768 }));
  const entries = buildFlightSecretEntries(credentials, existing);
  if (mode === '--check') { console.log(JSON.stringify({ ok: true, names: entries.map(e => e.name), applied: false })); return; }
  const resources = JSON.parse(readFileSync(new URL('./vault-resources.json', import.meta.url), 'utf8'));
  // Use the existing OCI CLI Python environment and operator identity, never copy its key.
  const python = readFileSync('/opt/homebrew/bin/oci', 'utf8').split('\n')[0].replace(/^#!/, '');
  if (!/^\/opt\/homebrew\/Cellar\/oci-cli\/[^/]+\/libexec\/bin\/python[0-9.]*$/.test(python)) throw new Error();
  const payload = Buffer.from(JSON.stringify({ resources, entries }));
  let result;
  try { result = spawnSync(python, ['-c', register], { input: payload, encoding: 'utf8', timeout: 480000, maxBuffer: 32768 }); }
  finally { payload.fill(0); }
  const reportResult = JSON.parse(result.stdout || '{}');
  // Return only explicitly selected non-secret fields, including on partial failure.
  if (result.status !== 0 || reportResult.ok !== true || !Array.isArray(reportResult.secrets)) throw new Error();
  console.log(JSON.stringify({ ok: true, secrets: reportResult.secrets.map(s => ({ name: s.name, id: s.id, versionNumber: s.versionNumber, created: s.created })), vm_iam_granted: false, database_accounts_changed: false }));
}
if (isMainModule(import.meta.url)) {
  main().catch(() => { console.log(JSON.stringify({ ok: false, code: 'FLIGHT_SECRET_REGISTRATION_FAILED', partial_creations_may_exist: true })); process.exitCode = 1; });
}


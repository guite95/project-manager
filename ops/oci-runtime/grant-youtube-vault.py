"""Run with the existing operator OCI Python SDK. Exact Secret IDs and egress only."""
import json
from pathlib import Path
import sys
import oci

try:
    root = Path(__file__).resolve().parent
    resources = json.loads((root / 'vault-resources.json').read_text())
    access = json.loads((root / 'vault-access.json').read_text())
    config = oci.config.from_file()
    config['region'] = resources['region']
    identity = oci.identity.IdentityClient(config, retry_strategy=oci.retry.NoneRetryStrategy())
    source = identity.get_network_source(access['networkSourceId']).data
    if source.name != access['networkSourceName'] or source.public_source_list != access['publicSourceList'] or source.virtual_source_list or source.services != ['none']:
        raise RuntimeError()
    ids = [json.loads((root / ('vault-manifest.youtube-'+s+'.json')).read_text())['files'][0]['secretId'] for s in ['backend', 'media', 'migration']]
    statements = ["Allow dynamic-group id "+access['dynamicGroupId']+" to read secret-bundles in compartment id "+resources['compartmentId']+
                  " where all {target.secret.id = '"+secret+"', request.networkSource.name = '"+source.name+"'}" for secret in ids]
    name = 'youtube-runtime-secret-bundles'
    existing = [p for p in oci.pagination.list_call_get_all_results(identity.list_policies, compartment_id=resources['compartmentId']).data if p.name == name]
    if len(existing) > 1: raise RuntimeError()
    if existing:
        policy = identity.get_policy(existing[0].id).data
        if policy.statements != statements: raise RuntimeError()
    else:
        policy = identity.create_policy(oci.identity.models.CreatePolicyDetails(compartment_id=resources['compartmentId'], name=name,
                    description='YouTube host-only publishers: three fixed Secrets, approved VM egress', statements=statements)).data
    print(json.dumps({'ok': True, 'policyId': policy.id, 'secretCount': 3, 'adminSecretGranted': False}))
except Exception:
    print(json.dumps({'ok': False, 'code': 'YOUTUBE_VAULT_POLICY_FAILED', 'reconcileBeforeRetry': True}))
    sys.exit(1)

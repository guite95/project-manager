"""Exact Ilchul/host Redis Secret reads; no IAM/resource administration for the VM."""
import json
from pathlib import Path
import sys
import oci

try:
 root=Path(__file__).resolve().parent
 resources=json.loads((root/'vault-resources.json').read_text())
 access=json.loads((root/'vault-access.json').read_text())
 config=oci.config.from_file();config['region']=resources['region']
 identity=oci.identity.IdentityClient(config,retry_strategy=oci.retry.NoneRetryStrategy())
 source=identity.get_network_source(access['networkSourceId']).data
 assert source.name==access['networkSourceName'] and source.public_source_list==access['publicSourceList'] and not source.virtual_source_list and source.services==['none']
 ids=[json.loads((root/('vault-manifest.'+s+'.json')).read_text())['files'][0]['secretId'] for s in ['ilchul-backend','ilchul-migration','redis-admin']]
 statements=["Allow dynamic-group id "+access['dynamicGroupId']+" to read secret-bundles in compartment id "+resources['compartmentId']+" where all {target.secret.id = '"+secret+"', request.networkSource.name = '"+source.name+"'}" for secret in ids]
 name='ilchul-host-secret-bundles'
 existing=[p for p in oci.pagination.list_call_get_all_results(identity.list_policies,compartment_id=resources['compartmentId']).data if p.name==name]
 assert len(existing)<=1
 if existing:
  policy=identity.get_policy(existing[0].id).data;assert policy.statements==statements
 else:
  policy=identity.create_policy(oci.identity.models.CreatePolicyDetails(compartment_id=resources['compartmentId'],name=name,description='Ilchul app/migration and host-only Redis ACL publisher: exact Secrets, approved VM egress',statements=statements)).data
 print(json.dumps({'ok':True,'policyId':policy.id,'secretCount':3,'resourceAdministrationGranted':False}))
except Exception:
 print(json.dumps({'ok':False,'code':'ILCHUL_VAULT_POLICY_FAILED','reconcileBeforeRetry':True}));sys.exit(1)

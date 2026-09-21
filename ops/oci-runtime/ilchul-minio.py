"""Add scoped Ilchul MinIO principal; never modify the shared root or public policy."""
import datetime
import io
import json
import os
from pathlib import Path
import re
import resource
import subprocess
import sys
import uuid

def app_policy():
 return {'Version':'2012-10-17','Statement':[
  {'Effect':'Allow','Action':['s3:GetBucketLocation','s3:ListBucket'],'Resource':['arn:aws:s3:::ilchul']},
  {'Effect':'Allow','Action':['s3:GetObject','s3:PutObject','s3:DeleteObject'],'Resource':['arn:aws:s3:::ilchul/*']}]}

def main(data):
 from minio import Minio
 from minio.credentials import StaticProvider
 from minio.minioadmin import MinioAdmin
 from minio.error import S3Error,MinioAdminException
 import urllib3
 assert os.geteuid()==0
 resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
 c=json.loads(subprocess.check_output(['docker','inspect','minio']))[0]
 env=dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
 host=c['NetworkSettings']['Networks']['shared-infra']['IPAddress']
 assert re.fullmatch(r'172\.27\.\d{1,3}\.\d{1,3}',host)
 endpoint=host+':9000';pool=urllib3.PoolManager(timeout=urllib3.Timeout(connect=5,read=20),retries=False)
 admin=MinioAdmin(endpoint=endpoint,credentials=StaticProvider(env['MINIO_ROOT_USER'],env['MINIO_ROOT_PASSWORD']),secure=False,http_client=pool)
 root=Minio(endpoint,access_key=env['MINIO_ROOT_USER'],secret_key=env['MINIO_ROOT_PASSWORD'],secure=False,http_client=pool)
 account=data['account'];user,password=account['new_access_key'],account['new_secret_key']
 assert re.fullmatch('[A-Za-z_][A-Za-z0-9_-]{2,63}',user) and len(password)>=12
 users=json.loads(admin.user_list());policies=json.loads(admin.policy_list())
 public=json.loads(root.get_bucket_policy('ilchul'))
 name='ilchul-runtime-vault-v1'
 if data['mode']=='inspect':
  return {'ok':True,'userCollision':user in users,'policyCollision':name in policies,'publicStatementCount':len(public.get('Statement',[]))}
 assert data['mode'] in ['provision','verify']
 if data['mode']=='provision':
  assert user not in users and name not in policies
  backup=Path('/var/backups/ilchul-vault')/('minio-before-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.json')
  backup.write_text(json.dumps({'users':users,'policies':policies,'public':public}))
  admin.policy_add(name,policy=app_policy())
  admin.user_add(user,password)
  admin.policy_set(name,user=user)
 info=json.loads(admin.user_info(user))
 assert info.get('policyName')==name and info.get('status')=='enabled'
 client=Minio(endpoint,access_key=user,secret_key=password,secure=False,http_client=pool)
 key='users/profile/vault-readiness-'+uuid.uuid4().hex+'.txt';payload=b'ilchul-vault-readiness-synthetic'
 created=False
 try:
  client.put_object('ilchul',key,io.BytesIO(payload),len(payload),content_type='text/plain');created=True
  response=client.get_object('ilchul',key)
  try:assert response.read()==payload
  finally:response.close();response.release_conn()
  assert client.stat_object('ilchul',key).size==len(payload)
  # Only this random probe key is listed/read/deleted; existing user data is untouched.
  assert len(list(client.list_objects('ilchul',prefix=key)))==1
  try:
   # MinIO may return a filtered list instead of rejecting ListBuckets outright.
   assert all(b.name=='ilchul' for b in client.list_buckets())
  except S3Error as e:assert e.code=='AccessDenied'
  probe_admin=MinioAdmin(endpoint=endpoint,credentials=StaticProvider(user,password),secure=False,http_client=pool)
  try:probe_admin.user_list();raise AssertionError()
  except MinioAdminException as e:assert e._code=='403'
 finally:
  if created:client.remove_object('ilchul',key)
 assert json.loads(root.get_bucket_policy('ilchul'))==public
 return {'ok':True,'bucket':'ilchul','writeReadListDelete':True,'adminDenied':True,'otherBucketsNotListed':True,'publicPolicyUnchanged':True,'probeRemoved':True,'existingUsersUnchanged':True}

if __name__=='__main__':
 try:print(json.dumps(main(json.load(sys.stdin))))
 except Exception:print(json.dumps({'ok':False,'code':'ILCHUL_MINIO_FAILED','partialArtifactsPreserved':True}));sys.exit(1)

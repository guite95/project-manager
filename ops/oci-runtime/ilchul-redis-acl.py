"""Ilchul Redis key/command ACL; preserve all live keys and existing accounts."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import resource
import subprocess
import sys

s=importlib.util.spec_from_file_location('shared_acl',Path(__file__).with_name('youtube-redis-acl.py'))
shared=importlib.util.module_from_spec(s);s.loader.exec_module(shared)
KEYS=['~refresh','~refresh:*','~plan:draft:*','~search:recent:user:*','~search:popular:*','~search:autocomplete:popular:*']
COMMANDS=['+ping','+hello','+select','+client|setinfo','+client|setname','+info',
 '+get','+set','+del','+exists','+expire','+pexpire','+ttl','+pttl','+type','+persist',
 '+hset','+hget','+hgetall','+hdel','+hexists','+hmset','+hmget',
 '+sadd','+srem','+smembers','+sinter','+sunion','+scard',
 '+lrange','+lrem','+llen','+rpop','+lpush',
 '+zincrby','+zrange','+zrevrange','+zadd','+zrem','+zscore','+zcard']

def reconcile(check_only=False):
 resource.setrlimit(resource.RLIMIT_CORE,(0,0))
 container=json.loads(subprocess.check_output(['docker','inspect','redis']))[0]
 host=container['NetworkSettings']['Networks']['shared-infra']['IPAddress']
 if not re.fullmatch(r'172\.27\.\d{1,3}\.\d{1,3}',host):raise ValueError()
 client=shared.admin_client(host,check_only)
 try:
  v=shared.secret('ilchul-backend');user,password=v['REDIS_USERNAME'],v['REDIS_PASSWORD']
  if not re.fullmatch('[A-Za-z_][A-Za-z0-9_-]{0,63}',user) or user=='default':raise ValueError()
  current=client.command('ACL','GETUSER',user)
  if current is None:
   if check_only:raise ValueError()
   client.command('ACL','SETUSER',user,'reset','on','>'+password,'-@all',*KEYS,*COMMANDS)
   current=client.command('ACL','GETUSER',user)
  state=dict(zip(current[::2],current[1::2]))
  if state['passwords']!=[hashlib.sha256(password.encode()).hexdigest()] or set(state['keys'].split())!=set(KEYS) or set(state['commands'].split())!=set(['-@all',*COMMANDS]) or state.get('selectors') or state.get('channels'):raise ValueError()
  allowed=[('GET','plan:draft:vault-probe'),('HGETALL','refresh:vault-probe'),('SADD','refresh','vault-probe'),('SADD','refresh:refreshToken:synthetic','vault-probe'),('SET','refresh:vault-probe:phantom','synthetic'),('LRANGE','search:recent:user:vault-probe',0,0),('ZREVRANGE','search:popular:monthly:vault-probe',0,0,'WITHSCORES')]
  for command in allowed:
   if client.command('ACL','DRYRUN',user,*command)!='OK':raise ValueError()
  for command in [('GET','youtube-sync:denied'),('CONFIG','GET','*'),('ACL','LIST'),('FLUSHALL',),('KEYS','*'),('GET','other:denied')]:
   try:
    if client.command('ACL','DRYRUN',user,*command)=='OK':raise ValueError()
   except RuntimeError as error:
    if str(error)!='REDIS_OPERATION_REJECTED':raise
  probe=shared.Redis(host)
  try:
   if probe.command('AUTH',user,password)!='OK' or probe.command('PING')!='PONG':raise ValueError()
  finally:probe.close()
  return {'ok':True,'scopedUsers':1,'positiveAclChecks':len(allowed),'negativeAclChecks':6,'existingKeysUnchanged':True,'defaultUnchanged':True}
 finally:client.close()
if __name__=='__main__':
 try:
  if sys.argv[1:] not in ([],['--check']):raise ValueError()
  print(json.dumps(reconcile(bool(sys.argv[1:]))))
 except Exception:print(json.dumps({'ok':False,'code':'ILCHUL_REDIS_ACL_FAILED'}));sys.exit(1)

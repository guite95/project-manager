import importlib.util
from pathlib import Path
import unittest
s=importlib.util.spec_from_file_location('acl',Path(__file__).with_name('youtube-redis-acl.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Admin(unittest.TestCase):
 def test_check_only_cannot_bootstrap_admin(self):
  calls=[]
  class Missing:
   def command(self,*args):
    calls.append(args)
    if args[0]=='AUTH':raise RuntimeError('REDIS_OPERATION_REJECTED')
    return None
  with self.assertRaises(RuntimeError):m.authenticate_admin(Missing(),{'REDIS_USERNAME':'fixture-admin','REDIS_PASSWORD':'fixture-password'},check_only=True)
  self.assertFalse(any(c[:2]==('ACL','SETUSER') for c in calls))
 def test_existing_named_user_is_never_reset(self):
  calls=[]
  class Existing:
   def command(self,*args):
    calls.append(args)
    if args[0]=='AUTH':raise RuntimeError('REDIS_OPERATION_REJECTED')
    if args[:2]==('ACL','GETUSER'):return ['flags',['on']]
  with self.assertRaises(RuntimeError):m.authenticate_admin(Existing(),{'REDIS_USERNAME':'fixture-admin','REDIS_PASSWORD':'fixture-password'})
  self.assertFalse(any(c[:2]==('ACL','SETUSER') for c in calls))
 def test_authenticated_admin_needs_no_anonymous_fallback(self):
  class Authenticated:
   def command(self,*args):
    if args[0]!='AUTH':raise AssertionError()
    return 'OK'
  m.authenticate_admin(Authenticated(),{'REDIS_USERNAME':'fixture-admin','REDIS_PASSWORD':'fixture-password'})
if __name__=='__main__':unittest.main()

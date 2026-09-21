import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import json
s=importlib.util.spec_from_file_location('runtime',Path(__file__).with_name('ilchul-runtime.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Recovery(unittest.TestCase):
 def fixture(self,running=False,vault=True):
  return {'State':{'Running':running},'Config':{'Image':'ghcr.io/begae4/ilchul-backend:'+'a'*40,'Env':['ILCHUL_RUNTIME_MODE=vault'] if vault else []}}
 def test_legacy_and_running_apps_are_not_recreated(self):
  self.assertFalse(m.needs_recovery(self.fixture(True)))
  self.assertFalse(m.needs_recovery(self.fixture(False,False)))
 def test_stopped_vault_app_requires_pinned_image(self):
  self.assertTrue(m.needs_recovery(self.fixture()))
  c=self.fixture();c['Config']['Image']='ghcr.io/begae4/ilchul-backend:latest'
  with self.assertRaises(ValueError):m.needs_recovery(c)
 def test_failed_publisher_prevents_recreate_and_next_tick_can_recover(self):
  backend=self.fixture();backend['Config']['Labels']={'com.docker.compose.project':'fixture'}
  frontend={'State':{'Running':False},'Config':{'Image':'ghcr.io/begae4/ilchul-frontend:'+'b'*40}}
  calls=[];failure=[True]
  def execute(args,**kwargs):
   calls.append(args)
   if args[:2]==['docker','inspect']:return json.dumps([backend,frontend]).encode()
   if args[:2]==['systemctl','start'] and failure[0]:raise RuntimeError()
   return b''
  with patch.object(m,'run',execute),patch.object(m.Path,'read_text',return_value='blue'):
   with self.assertRaises(RuntimeError):m.tick()
   self.assertFalse(any(c[:2]==['docker','compose'] for c in calls))
   failure[0]=False;m.tick()
  compose=next(c for c in calls if c[:2]==['docker','compose'])
  self.assertEqual(compose[3],'fixture');self.assertIn('--force-recreate',compose)
  self.assertEqual(compose[-1],'ilchul-backend-blue')
  self.assertLess(next(i for i,c in enumerate(calls) if c[:2]==['systemctl','reload']),calls.index(compose))
if __name__=='__main__':unittest.main()

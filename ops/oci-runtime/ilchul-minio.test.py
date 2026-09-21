import importlib.util
from pathlib import Path
import unittest
s=importlib.util.spec_from_file_location('storage',Path(__file__).with_name('ilchul-minio.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Storage(unittest.TestCase):
 def test_app_policy_cannot_administer_or_touch_other_buckets(self):
  policy=m.app_policy()
  self.assertEqual(policy['Version'],'2012-10-17')
  actions={a for st in policy['Statement'] for a in st['Action']}
  self.assertEqual(actions,{'s3:GetBucketLocation','s3:ListBucket','s3:GetObject','s3:PutObject','s3:DeleteObject'})
  resources={a for st in policy['Statement'] for a in st['Resource']}
  self.assertEqual(resources,{'arn:aws:s3:::ilchul','arn:aws:s3:::ilchul/*'})
if __name__=='__main__':unittest.main()

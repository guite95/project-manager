import importlib.util
from pathlib import Path
import unittest

s=importlib.util.spec_from_file_location('database',Path(__file__).with_name('ilchul-database.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Permissions(unittest.TestCase):
 def test_service_grants_are_schema_scoped_without_grant_option(self):
  runtime=m.grants('fixture-runtime','runtime')
  migration=m.grants('fixture-migration','migration')
  self.assertEqual(runtime,"GRANT SELECT,INSERT,UPDATE,DELETE ON `ilchul_db`.* TO 'fixture-runtime'@'172.27.%';")
  self.assertIn('CREATE',migration);self.assertNotIn('GRANT OPTION',migration)
  self.assertNotIn('*.*',migration)
  for value in ['root',"bad'",'a'*33]:
   with self.assertRaises(ValueError):m.grants(value,'runtime')
 def test_literals_reject_control_characters(self):
  self.assertEqual(m.literal("fixture'p\\word"),"'fixture\\'p\\\\word'")
  with self.assertRaises(ValueError):m.literal('bad\nvalue')
if __name__=='__main__':unittest.main()

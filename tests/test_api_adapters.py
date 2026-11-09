"""Fictional, offline coverage for imported keyed adapters."""
import os
import unittest
from datetime import datetime,timezone,timedelta
from quotacore.providers.common import estimate_expired_windows
from quotacore.bar import report
from unittest import mock
from quotacore.providers import PROVIDERS
from quotacore.consent import DISCLOSURES

FIXTURES = {
 'zai': {'success':True,'data':{'limits':[{'type':'TOKENS_LIMIT','percentage':42,'nextResetTime':1900000000000}]}},
 'moonshot': {'data':{'available_balance':12.5}},
 'siliconflow': {'code':20000,'data':{'totalBalance':'8.25'}},
 'openai_admin': {'data':[{'results':[{'amount':{'value':'2.50'}}]}],'has_more':False},
 'anthropic_admin': {'data':[{'results':[{'amount':'125'}]}],'has_more':False},
}
KEYS={'zai':'ZAI_API_KEY','moonshot':'MOONSHOT_API_KEY','siliconflow':'SILICONFLOW_API_KEY','openai_admin':'OPENAI_ADMIN_KEY','anthropic_admin':'ANTHROPIC_ADMIN_KEY'}
HOSTS={'zai':'api.z.ai','moonshot':'api.moonshot.ai','siliconflow':'api.siliconflow.cn','openai_admin':'api.openai.com','anthropic_admin':'api.anthropic.com'}

class EstimateTests(unittest.TestCase):
 def test_only_stale_expired_windows_become_estimated(self):
  now=datetime(2030,1,1,tzinfo=timezone.utc)
  base={"windows":[{"used_percent":73,"resets_at":"2029-12-31T23:00:00Z"},{"used_percent":22,"resets_at":"2030-01-02T00:00:00Z"},{"used_percent":19,"resets_at":"invalid"},{"used_percent":10}]}
  result=estimate_expired_windows(base,now)
  self.assertEqual(result["windows"][0]["used_percent"],0); self.assertTrue(result["windows"][0]["estimated"])
  self.assertEqual(result["windows"][1]["used_percent"],22); self.assertNotIn("estimated",result["windows"][1])
  self.assertEqual(result["windows"][2],base["windows"][2]); self.assertEqual(result["windows"][3],base["windows"][3])
  live=dict(base,state="OK",stale=False)
  self.assertEqual(live["windows"],base["windows"])
 def test_bar_marks_estimate(self):
  snap={"generated_at":"2030-01-01T00:00:00Z","providers":[{"id":"claude","label":"Claude","state":"STALE","stale":True,"windows":[{"kind":"session","label":"Session","used_percent":0,"estimated":True}]}]}
  self.assertIn("~0%",report(snap,now=datetime(2030,1,1,tzinfo=timezone.utc))["text"])

class ImportedProviderTests(unittest.TestCase):
 def test_each_new_provider_has_a_specific_disclosure(self):
  for pid, env_name in KEYS.items():
   with self.subTest(pid=pid):
    text=DISCLOSURES[pid]
    self.assertIn(env_name,text)
    self.assertIn(HOSTS[pid],text)

 def test_new_providers_have_expected_lifecycle(self):
  for pid, payload in FIXTURES.items():
   module=PROVIDERS[pid]
   with self.subTest(pid=pid), mock.patch.dict(os.environ,{KEYS[pid]:'fictional-secret'}), mock.patch.object(module,'get_json',return_value=(payload,None,None,None)) as http:
    result=module.read()
    self.assertEqual(result['state'],'OK'); self.assertTrue(result['experimental']); http.assert_called_once()
    self.assertNotIn('fictional-secret',repr(result))
 def test_missing_key_and_http_failures(self):
  for pid in FIXTURES:
   module=PROVIDERS[pid]
   with self.subTest(pid=pid), mock.patch.dict(os.environ,{},clear=False):
    os.environ.pop(KEYS[pid],None)
    with mock.patch.object(module,'api_key',return_value=None): self.assertEqual(module.read()['state'],'AUTH_REQUIRED')
    for state in ('AUTH_REQUIRED','RATE_LIMITED'):
     with mock.patch.object(module,'api_key',return_value='fictional-secret'), mock.patch.object(module,'get_json',return_value=(None,state,'safe provider error',None)):
      r=module.read(); self.assertEqual(r['state'],state); self.assertNotIn('fictional-secret',repr(r))
 def test_bad_schemas(self):
  for pid in FIXTURES:
   with self.subTest(pid=pid), mock.patch.object(PROVIDERS[pid],'api_key',return_value='fictional'), mock.patch.object(PROVIDERS[pid],'get_json',return_value=({},None,None,None)):
    self.assertEqual(PROVIDERS[pid].read()['state'],'SCHEMA_CHANGED')

if __name__=='__main__': unittest.main()

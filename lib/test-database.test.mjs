import assert from 'node:assert/strict';
import test from 'node:test';
test('test reset refuses nonlocal or nontest databases including SSH loopback ports', async () => {
  const {assertTestDatabase} = await import('./test-database.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
  assert.equal(typeof assertTestDatabase,'function');
  assert.doesNotThrow(()=>assertTestDatabase('postgresql://user@localhost:5432/project_management_test'));
  for(const url of ['postgresql://user@localhost:5432/project_management','postgresql://user@localhost:15435/project_management_test','postgresql://user@server:5432/project_management_test']) assert.throws(()=>assertTestDatabase(url));
});

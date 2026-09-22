import test from 'node:test';
import assert from 'node:assert/strict';
import { canProject, routeRequirement, permits } from './policy.ts';
const member = { id:'u', role:'MEMBER', memberships:[{projectSlug:'tns',role:'VIEWER'}] };
test('project roles deny other projects and writes for viewers', () => {
  assert.equal(canProject(member,'tns','read'),true);
  assert.equal(canProject(member,'tns','write'),false);
  assert.equal(canProject(member,'other','read'),false);
  const editor={...member,memberships:[{projectSlug:'tns',role:'EDITOR'}]};
  assert.equal(canProject(editor,'tns','write'),true);
  assert.equal(canProject(editor,'tns','delete'),false);
});
test('private projects and owner data stay private even from admins',()=>{
  const admin={...member,role:'ADMIN'};
  assert.equal(canProject(admin,'personal-flight-app','read'),false);
  for(const path of ['/ai-ops','/api/ai-ops/search','/today','/api/board','/api/history','/api/settings','/api/new-unknown'])
    assert.equal(permits(admin,routeRequirement(path,'GET')),false,path);
  assert.equal(permits(admin,routeRequirement('/settings','GET')),true);
  for(const path of ['/flows/%70ersonal-ilchul','/api/flows/%70ersonal-ilchul/chart','/api/notes/%70ersonal-ilchul','/api/flows/%70ersonal-ilchul/materials/file'])
    for(const method of ['GET','PUT','POST','DELETE']) assert.equal(permits(admin,routeRequirement(path,method)),false,`${method} ${path}`);
  assert.equal(permits({...member,role:'OWNER'},routeRequirement('/flows/a%2Fb','GET')),false);
});
test('route policy covers project operations and rejects unexpected writes',()=>{
  assert.equal(permits(member,routeRequirement('/flows/tns','GET')),true);
  assert.equal(permits(member,routeRequirement('/api/flows/tns/chart','GET')),true);
  assert.equal(permits(member,routeRequirement('/api/flows/tns/chart','PUT')),false);
  assert.equal(permits(member,routeRequirement('/flows/tns','POST')),false);
  assert.equal(permits(member,routeRequirement('/api/flows/navigation','GET')),true);
  assert.equal(permits(member,routeRequirement('/api/flows/tns/anything/extra','GET')),false);
  assert.equal(permits(null,routeRequirement('/flows','GET')),false);
});

test('personal projects require explicit membership for both admins and members',()=>{
  for (const role of ['ADMIN','MEMBER']) for (const permission of ['VIEWER','EDITOR']) {
    const actor={id:'u',role,memberships:[{projectSlug:'personal-ilchul',role:permission}]};
    assert.equal(permits(actor,routeRequirement('/flows/%70ersonal-ilchul','GET')),true);
    assert.equal(permits(actor,routeRequirement('/api/flows/personal-ilchul/chart','PUT')),permission==='EDITOR');
    assert.equal(permits(actor,routeRequirement('/api/notes/personal-ilchul','POST')),permission==='EDITOR');
    assert.equal(canProject(actor,'personal-flight-app','read'),false);
    assert.equal(canProject(actor,'personal-ilchul','delete'),false);
    assert.equal(permits(actor,routeRequirement('/api/ai-ops/search','GET')),false);
  }
});

test('채용 문서와 API는 모든 읽기·쓰기에서 소유자만 접근한다', () => {
  for (const path of ['/recruitment/experiences', '/recruitment/cover-letters', '/api/recruitment', '/api/recruitment/ERP01']) {
    for (const method of ['GET', 'PUT']) {
      for (const role of ['ADMIN', 'MEMBER']) assert.equal(permits({ ...member, role }, routeRequirement(path, method)), false);
      assert.equal(permits(null, routeRequirement(path, method)), false);
      assert.equal(permits({ ...member, role: 'OWNER' }, routeRequirement(path, method)), true);
    }
  }
});

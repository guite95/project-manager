import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from './test-db.mjs';
import { saveManagedProject, listManagedProjects } from './project-registry-store.ts';
import { loadUiPreferences, saveUiPreferences } from './ui-preferences-store.ts';
import { readFlowCatalog, toFlowNavigation } from './flow-catalog-store.ts';
import { isPersonalProject } from '../personal-projects.ts';
import { projectForRepository } from '../project-repositories.ts';
import { canProject } from '../access/policy.ts';

const owner = {id:'registry-owner',role:'OWNER',memberships:[]};
const admin = {id:'registry-admin',role:'ADMIN',memberships:[]};
const created = [];
test('동적으로 추가한 회사·개인 프로젝트의 메뉴, 분류, 저장소, 권한과 충돌을 DB에서 관리한다', async () => {
  try {
    const create = async (actor, input) => {const row=await saveManagedProject(actor,input);created.push(row.slug);return row;};
    const personal = await create(owner,{title:'새 개인 프로젝트',scope:'PERSONAL',personalGroup:'TOY',repositories:[{workspace:'UK',path:'registry-test/new-app'}]});
    const company = await create(admin,{title:'새 풀링 프로젝트',scope:'COMPANY',repositories:[{workspace:'PROJECTS',path:'registry-test/new-app'}]});
    assert.equal(personal.scope,'PERSONAL');
    assert.equal((await loadUiPreferences('personal-project-groups')).values[personal.slug],'toy');
    const nav=toFlowNavigation(await readFlowCatalog(personal.slug));
    assert.equal(isPersonalProject(nav[0]),true);
    assert.equal(canProject({...admin,projectScopes:{[personal.slug]:'PERSONAL',[company.slug]:'COMPANY'}},personal.slug,'read'),false);
    assert.equal(canProject({...admin,projectScopes:{[company.slug]:'COMPANY'}},company.slug,'write'),true);
    assert.equal(canProject({...admin,memberships:[{projectSlug:personal.slug,role:'VIEWER'}]},personal.slug,'read'),true);
    assert.equal(projectForRepository('/work/uk/registry-test/new-app',[{key:`app:${personal.slug}`,title:personal.title,repositories:personal.repositories}],{UK:'/work/uk',PROJECTS:'/work/projects'}),`app:${personal.slug}`);
    await assert.rejects(() => saveManagedProject(admin,{title:'불가',scope:'PERSONAL',personalGroup:'TOY',repositories:[]}));
    await assert.rejects(() => listManagedProjects(admin,'PERSONAL'));
    await assert.rejects(() => saveManagedProject({...owner,role:'MEMBER'},{title:'불가',scope:'COMPANY',repositories:[]}));
    await assert.rejects(() => saveManagedProject(owner,{title:'중복',scope:'PERSONAL',personalGroup:'TOY',repositories:personal.repositories}));
    const renamed=await saveManagedProject(owner,{title:'변경한 이름',revision:personal.revision,repositories:personal.repositories},personal.slug);
    assert.equal(renamed.title,'변경한 이름');
    await assert.rejects(() => saveManagedProject(owner,{title:'오래된 수정',revision:personal.revision,repositories:[]},personal.slug),error=>error.status===409);
    await assert.rejects(() => saveManagedProject(owner,{title:'소속 변경',scope:'COMPANY',revision:renamed.revision,repositories:[]},personal.slug));
    await saveUiPreferences('personal-project-groups',{[personal.slug]:'portfolio'});
    assert.equal((await prisma.flowProject.findUnique({where:{slug:personal.slug}})).personalGroup,'PORTFOLIO');
    await assert.rejects(() => saveUiPreferences('personal-project-groups',{[company.slug]:'toy'}));
    await assert.rejects(() => saveUiPreferences('personal-project-groups',{[personal.slug]:'toy','not-registered':'toy'}));
    assert.equal((await loadUiPreferences('personal-project-groups')).values[personal.slug],'portfolio');
    assert((await listManagedProjects(admin,'COMPANY')).some(row=>row.slug===company.slug));
  } finally {
    await prisma.projectRepository.deleteMany({where:{projectSlug:{in:created}}});
    await prisma.flowProject.deleteMany({where:{slug:{in:created}}});
    await prisma.accessAudit.deleteMany({where:{actorId:{in:[owner.id,admin.id]}}});
    await prisma.$disconnect();
  }
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { prisma } from '../server/test-db.mjs';
import { assertTestDatabase } from '../test-database.ts';
import { hashPassword } from '../password.ts';
import { createSessionToken } from '../session.ts';
import { canProject, permits, routeRequirement } from './policy.ts';

// Import only after test-db has replaced DATABASE_URL with the guarded local URL.
assertTestDatabase(process.env.DATABASE_URL);
const { acceptInvite, accessOverview, bootstrapOwner, changePassword, issueSession, loginAccount,
  manageAccess, resolveActor, resolveShare, revokeSession, throttle, tokenHash } = await import('./store.ts');
const password = 'test-account-password';
const project = 'test-access';
const personal = 'personal-flight-app';
const owner = { id: 'test-owner', role: 'OWNER', memberships: [] };
const admin = { id: 'test-admin', role: 'ADMIN', memberships: [] };
const member = { id: 'test-member', role: 'MEMBER', memberships: [] };
const oldEnv = { SESSION_SECRET: process.env.SESSION_SECRET, APP_PASSWORD_HASH: process.env.APP_PASSWORD_HASH };
let passwordHash;
const status = expected => error => error?.status === expected;
const tokenFrom = result => result.path.split('/').at(-1);
async function clean() {
  assertTestDatabase(process.env.DATABASE_URL);
  await prisma.accessShare.deleteMany();
  await prisma.accessInvite.deleteMany();
  await prisma.accessUser.deleteMany();
  await prisma.accessAudit.deleteMany();
  await prisma.accessThrottle.deleteMany();
  await prisma.flowDocument.deleteMany({ where: { projectSlug: { in: [project, personal] } } });
  await prisma.flowCategory.deleteMany({ where: { projectSlug: { in: [project, personal] } } });
  await prisma.flowProject.deleteMany({ where: { slug: { in: [project, personal] } } });
}
async function user(actor, username = actor.id) {
  return prisma.accessUser.create({ data: { id: actor.id, username, name: username, role: actor.role, passwordHash } });
}
async function invite(username, role = 'MEMBER') {
  return tokenFrom(await manageAccess(owner, { action: 'invite', username, name: username, role }));
}
before(async () => { passwordHash = await hashPassword(password); });
beforeEach(async () => {
  await clean();
  process.env.SESSION_SECRET = 'access-tests-only-session-secret';
  process.env.APP_PASSWORD_HASH = passwordHash;
  for (const slug of [project, personal]) {
    await prisma.flowProject.create({ data: { slug, title: slug, position: 999, categories: { create: {
      slug: 'work', title: 'Work', position: 0, charts: { create: [
        { slug: 'first', position: 0, document: { slug: 'first', title: 'First', nodes: [], edges: [] } },
        { slug: 'second', position: 1, document: { slug: 'second', title: 'Second', nodes: [], edges: [] } },
        { slug: 'erd', position: 2, document: { slug: 'erd', title: 'ERD', erdDomain: 'sales', nodes: [], edges: [] } },
      ] },
    } } } });
  }
});
after(async () => {
  await clean();
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await prisma.$disconnect();
});

test('bootstrap accepts the legacy password only before exactly one owner is created', async () => {
  assert.equal(await loginAccount('', password), null);
  const legacy = await createSessionToken(process.env.SESSION_SECRET, Date.now() + 60_000);
  const bootstrap = await resolveActor(legacy);
  assert.equal(bootstrap.bootstrap, true);
  const attempts = await Promise.allSettled(['owner-one', 'owner-two'].map(username =>
    bootstrapOwner(bootstrap, { username, name: username, password })));
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(await prisma.accessUser.count({ where: { role: 'OWNER' } }), 1);
  const session = attempts.find(result => result.status === 'fulfilled').value;
  assert.equal((await resolveActor(session)).role, 'OWNER');
  assert.equal(await resolveActor(legacy), null);
  await assert.rejects(() => loginAccount('', password), status(401));
  await assert.rejects(() => bootstrapOwner(owner, { username: 'third-owner', name: 'Third', password }), status(403));
});

test('account sessions reject wrong passwords, expiry, revocation and inactive users', async () => {
  await user(member);
  await assert.rejects(() => loginAccount(member.id, 'wrong-password'), status(401));
  await assert.rejects(() => loginAccount('unknown-user', password), status(401));
  const session = await loginAccount(member.id, password);
  assert.equal((await resolveActor(session)).id, member.id);
  await revokeSession(session);
  assert.equal(await resolveActor(session), null);
  const expired = await issueSession(member.id);
  await prisma.accessSession.update({ where: { tokenHash: tokenHash(expired.slice(3)) }, data: { expiresAt: new Date(0) } });
  assert.equal(await resolveActor(expired), null);
  const inactive = await issueSession(member.id);
  await prisma.accessUser.update({ where: { id: member.id }, data: { active: false } });
  assert.equal(await resolveActor(inactive), null);
  await assert.rejects(() => loginAccount(member.id, password), status(401));
  assert.equal(await resolveActor('v2.invalid'), null);
});

test('project roles distinguish reading, editing, deletion and owner-only private data', () => {
  const viewer = { ...member, memberships: [{ projectSlug: project, role: 'VIEWER' }] };
  const editor = { ...member, memberships: [{ projectSlug: project, role: 'EDITOR' }] };
  for (const [actor, expected] of [[null, [false,false,false]], [member, [false,false,false]],
    [viewer, [true,false,false]], [editor, [true,true,false]], [admin, [true,true,true]], [owner, [true,true,true]]]) {
    assert.deepEqual(['read','write','delete'].map(action => canProject(actor, project, action)), expected);
    assert.deepEqual(['read','write','delete'].map(action => canProject(actor, personal, action)), actor === owner ? [true,true,true] : [false,false,false]);
  }
  for (const path of ['/api/ai-ops', '/api/settings', '/api/unknown-new-feature']) {
    assert.equal(permits(admin, routeRequirement(path, 'GET')), false);
    assert.equal(permits(owner, routeRequirement(path, 'GET')), true);
  }
  assert.equal(permits(viewer, routeRequirement(`/api/flows/${project}/first`, 'PUT')), false);
  assert.equal(permits(editor, routeRequirement(`/api/flows/${project}/first`, 'PUT')), true);
  assert.equal(permits(editor, routeRequirement(`/api/flows/${project}/materials/first`, 'DELETE')), false);
});

test('invitations are single use even under concurrent acceptance', async () => {
  const token = await invite('invited-user');
  const results = await Promise.allSettled([acceptInvite(token, password), acceptInvite(token, password)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok([409,410].includes(results.find(result => result.status === 'rejected').reason.status));
  assert.equal(await prisma.accessUser.count({ where: { username: 'invited-user' } }), 1);
  assert.equal((await resolveActor(results.find(result => result.status === 'fulfilled').value)).role, 'MEMBER');
  await assert.rejects(() => acceptInvite(token, password), status(410));
});

test('expired, revoked and replaced invitations cannot create accounts', async () => {
  const expired = await invite('expired-user');
  await prisma.accessInvite.update({ where: { username: 'expired-user' }, data: { expiresAt: new Date(0) } });
  await assert.rejects(() => acceptInvite(expired, password), status(410));
  const revoked = await invite('revoked-user');
  const row = await prisma.accessInvite.findUnique({ where: { username: 'revoked-user' } });
  await manageAccess(owner, { action: 'revokeInvite', id: row.id });
  await assert.rejects(() => acceptInvite(revoked, password), status(410));
  const replaced = await invite('replaced-user');
  await invite('replaced-user');
  await assert.rejects(() => acceptInvite(replaced, password), status(410));
  assert.equal(await prisma.accessUser.count(), 0);
});

test('administrators cannot change themselves, owners or admin roles; members cannot manage access', async () => {
  for (const actor of [owner,admin,member]) await user(actor);
  const update = { action: 'updateUser', active: true, role: 'ADMIN', memberships: [] };
  for (const id of [owner.id,admin.id,member.id]) await assert.rejects(() => manageAccess(admin, { ...update, id }), status(403));
  await assert.rejects(() => manageAccess(admin, { action:'invite', username:'new-admin', name:'New admin', role:'ADMIN' }), status(403));
  await assert.rejects(() => manageAccess(member, { ...update, id: admin.id }), status(403));
  await assert.rejects(() => accessOverview(member), status(403));
  await assert.rejects(() => manageAccess(owner, { ...update, id: member.id, role:'MEMBER', memberships:[{projectSlug:personal,role:'VIEWER'}] }), status(400));
  const oldSession = await issueSession(member.id);
  await manageAccess(admin, { ...update, id: member.id, role:'MEMBER', memberships:[{projectSlug:project,role:'EDITOR'}] });
  assert.equal(await resolveActor(oldSession), null);
  assert.deepEqual((await resolveActor(await issueSession(member.id))).memberships, [{projectSlug:project,role:'EDITOR'}]);
  const adminInvite = await invite('another-admin', 'ADMIN');
  const row = await prisma.accessInvite.findUnique({where:{tokenHash:tokenHash(adminInvite)}});
  await assert.rejects(() => manageAccess(admin,{action:'revokeInvite',id:row.id}),status(403));
});

test('shares bind exactly one document and reject personal/ERD documents, expiry and revocation', async () => {
  const share = async (projectSlug, chartSlug) => tokenFrom(await manageAccess(owner,{action:'share',projectSlug,chartSlug,days:1}));
  const token = await share(project,'first');
  const resolved = await resolveShare(token);
  assert.equal(resolved.projectSlug,project);
  assert.equal(resolved.chartSlug,'first');
  assert.notEqual(resolved.chartSlug,'second');
  await assert.rejects(() => share(personal,'first'),status(400));
  await assert.rejects(() => share(project,'erd'),status(400));
  await assert.rejects(() => share(project,'missing'),status(400));
  await prisma.accessShare.update({where:{id:resolved.id},data:{expiresAt:new Date(0)}});
  assert.equal(await resolveShare(token),null);
  const revoked = await share(project,'second');
  const row = await resolveShare(revoked);
  await manageAccess(admin,{action:'revokeShare',id:row.id});
  assert.equal(await resolveShare(revoked),null);
  assert.equal(await resolveShare('invalid'),null);
  const overview = await accessOverview(owner);
  assert.ok(!overview.projects.some(item=>item.slug===personal));
  assert.ok(!overview.projects.find(item=>item.slug===project).charts.some(item=>item.slug==='erd'));
});

test('password changes invalidate all old sessions and preserve only the replacement', async () => {
  await user(member);
  const sessions = await Promise.all([issueSession(member.id),issueSession(member.id)]);
  await assert.rejects(() => changePassword(member,'incorrect-password','replacement-password'),status(403));
  assert.ok(await resolveActor(sessions[0]));
  const replacement = await changePassword(member,password,'replacement-password');
  for (const session of sessions) assert.equal(await resolveActor(session),null);
  assert.equal((await resolveActor(replacement)).id,member.id);
  await assert.rejects(() => loginAccount(member.id,password),status(401));
  assert.ok(await resolveActor(await loginAccount(member.id,'replacement-password')));
});

test('throttle counts concurrent attempts atomically and resets after expiry', async () => {
  const key = `test:${randomUUID()}`;
  const results = await Promise.allSettled(Array.from({length:8},()=>throttle(key,3)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,3);
  assert.ok(results.filter(result=>result.status==='rejected').every(result=>result.reason.status===429));
  await prisma.accessThrottle.update({where:{key:tokenHash(key)},data:{expiresAt:new Date(0)}});
  await throttle(key,3);
  assert.equal((await prisma.accessThrottle.findUnique({where:{key:tokenHash(key)}})).attempts,1);
});

test('a login that verified an old password cannot issue a session after password rotation',async()=>{
  await user(member);
  const old=(await prisma.accessUser.findUnique({where:{id:member.id}})).passwordHash;
  await changePassword(member,password,'replacement-password');
  await assert.rejects(()=>issueSession(member.id,old),status(401));
});

test('admin cannot replace an owner-issued admin invitation',async()=>{
  const token=await invite('protected-admin','ADMIN');
  await assert.rejects(()=>manageAccess(admin,{action:'invite',username:'protected-admin',name:'Changed',role:'MEMBER'}),status(403));
  assert.equal((await resolveActor(await acceptInvite(token,password))).role,'ADMIN');
});

test('owner promotion and invite replacement cannot be undone by a stale admin mutation',async()=>{
  await user(member);
  let release,locked;
  const held=new Promise(resolve=>{release=resolve;});
  const ready=new Promise(resolve=>{locked=resolve;});
  const promotion=prisma.$transaction(async tx=>{
    await tx.accessUser.update({where:{id:member.id},data:{role:'ADMIN'}});
    locked();await held;
  });
  await ready;
  const change=manageAccess(admin,{action:'updateUser',id:member.id,role:'MEMBER',active:false,memberships:[]});
  const denied=assert.rejects(()=>change,status(403));
  await new Promise(resolve=>setTimeout(resolve,50));release();
  await Promise.all([promotion,denied]);
  assert.equal((await prisma.accessUser.findUnique({where:{id:member.id}})).role,'ADMIN');

  await invite('promoted-invite');
  const row=await prisma.accessInvite.findUnique({where:{username:'promoted-invite'}});
  let releaseInvite,lockedInvite;
  const inviteHeld=new Promise(resolve=>{releaseInvite=resolve;});
  const inviteReady=new Promise(resolve=>{lockedInvite=resolve;});
  const replacement=prisma.$transaction(async tx=>{
    await tx.accessInvite.update({where:{id:row.id},data:{role:'ADMIN',tokenHash:tokenHash('replacement')}});
    lockedInvite();await inviteHeld;
  });
  await inviteReady;
  const revoke=manageAccess(admin,{action:'revokeInvite',id:row.id});
  const preserved=assert.rejects(()=>revoke,error=>[403,409].includes(error?.status));
  await new Promise(resolve=>setTimeout(resolve,50));releaseInvite();
  await Promise.all([replacement,preserved]);
  assert.equal((await prisma.accessInvite.findUnique({where:{id:row.id}})).role,'ADMIN');
});

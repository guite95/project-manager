import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { assertTestDatabase } from '../../lib/test-database.ts';

test('isolated PostgreSQL grants runtime CRUD only and migration ownership without cluster administrator rights', async () => {
  const { provisionPmRoles } = await import('./pg-roles.mjs').catch(error => { if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error; });
  assert.equal(typeof provisionPmRoles, 'function');
  assert.equal(process.env.PM_ISOLATED_ROLE_TEST, '1', 'requires explicitly isolated test container');
  const url = 'postgresql://postgres:FixtureAdminOnly1!@localhost:5432/project_management_test';
  assertTestDatabase(url);
  const admin = new pg.Client({ connectionString: url });
  const runtime = { username: 'pm_role_fixture_runtime', password: 'FixtureRuntime%1!' };
  const migration = { username: 'pm_role_fixture_migration', password: 'FixtureMigration%2!' };
  let app, migrator, old;
  try {
    await admin.connect();
    const { rows:[empty] } = await admin.query("SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v','m','S')");
    assert.equal(empty.count, 0, 'never modify a populated test database');
    await admin.query("CREATE ROLE pm_role_fixture_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'FixtureOwnerOnly1!'");
    await admin.query('ALTER DATABASE project_management_test OWNER TO pm_role_fixture_owner');
    await admin.query('SET ROLE pm_role_fixture_owner');
    await admin.query('CREATE TABLE public.fixture_work(id text PRIMARY KEY, value text)');
    await admin.query('CREATE TABLE public._prisma_migrations(id text PRIMARY KEY)');
    await admin.query('RESET ROLE');
    await admin.query('CREATE SCHEMA fixture_other');
    await admin.query('CREATE TABLE fixture_other.hidden(id text)');
    assert.deepEqual(await provisionPmRoles(admin, { runtime, migration, expectedDatabase: 'project_management_test' }), { created: 2, runtimeDdl: false });
    app = new pg.Client({ ...runtime, user: runtime.username, host:'localhost',port:5432,database:'project_management_test' });
    migrator = new pg.Client({ user:migration.username,password:migration.password,host:'localhost',port:5432,database:'project_management_test' });
    old = new pg.Client({ user:'pm_role_fixture_owner',password:'FixtureOwnerOnly1!',host:'localhost',port:5432,database:'project_management_test' });
    await app.connect(); await migrator.connect(); await old.connect();
    const wrong = new pg.Client({user:runtime.username,password:'wrong-fixture',host:'localhost',port:5432,database:'project_management_test'});
    await assert.rejects(wrong.connect(),error=>error.code==='28P01'); await wrong.end();
    await app.query("INSERT INTO public.fixture_work VALUES ('fixture', 'first')");
    await app.query("UPDATE public.fixture_work SET value='second' WHERE id='fixture'");
    assert.equal((await app.query('SELECT value FROM public.fixture_work')).rows[0].value,'second');
    assert.equal((await old.query('SELECT count(*)::int AS count FROM public.fixture_work')).rows[0].count,1);
    await app.query('SELECT id FROM public._prisma_migrations LIMIT 0');
    for(const sql of ['CREATE TABLE public.must_not_exist(id int)',"INSERT INTO public._prisma_migrations VALUES ('forged')",'SET ROLE pm_role_fixture_migration','SELECT * FROM fixture_other.hidden']) {
      await assert.rejects(app.query(sql), error => error.code === '42501');
    }
    await migrator.query('ALTER TABLE public.fixture_work ADD COLUMN note text');
    await migrator.query('CREATE TABLE public.fixture_future(id serial PRIMARY KEY, value text)');
    await app.query("INSERT INTO public.fixture_future(value) VALUES ('future-default-grants')");
    assert.equal((await app.query('SELECT id FROM public.fixture_future')).rows[0].id,1);
    await assert.rejects(app.query("SELECT setval('public.fixture_future_id_seq', 50)"), error => error.code === '42501');
    await app.query('DELETE FROM public.fixture_work');
    for(const client of [app,migrator]) {
      const {rows:[r]}=await client.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user');
      assert.deepEqual(Object.values(r),[false,false,false,false,false]);
    }
    await assert.rejects(provisionPmRoles(admin, { runtime, migration, expectedDatabase:'project_management_test' }), /PM_ROLE_PROVISION_FAILED/);
    assert.equal((await app.query('SELECT count(*)::int AS count FROM public.fixture_future')).rows[0].count,1);
  } finally {
    await app?.end(); await migrator?.end(); await old?.end(); await admin.end();
  }
});

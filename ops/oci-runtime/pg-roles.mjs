// Runs only on an operator-owned administrator connection. Values are bound
// parameters; PostgreSQL quotes identifiers/literals inside an invoker-only temp function.
export async function provisionPmRoles(client, { runtime, migration, expectedDatabase }) {
  let transaction = false;
  try {
    if (!['project_management', 'project_management_test'].includes(expectedDatabase)) throw new Error();
    for (const account of [runtime, migration]) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(account?.username ?? '') || typeof account.password !== 'string'
        || account.password.length < 12 || account.password.length > 32 || !/^[\x21-\x7e]+$/.test(account.password)) throw new Error();
    }
    if (runtime.username.toLowerCase() === migration.username.toLowerCase()) throw new Error();
    const { rows:[identity] } = await client.query('SELECT current_database() AS db, rolsuper FROM pg_roles WHERE rolname=current_user');
    if (identity?.db !== expectedDatabase || identity.rolsuper !== true) throw new Error();
    // Set outside the transaction: even a failed transaction must not restore
    // statement/parameter logging before the connection is closed by its owner.
    for (const [name,value] of Object.entries({log_statement:'none',log_min_duration_statement:'-1',log_duration:'off',log_min_error_statement:'panic',
      log_min_messages:'panic',log_error_verbosity:'terse',log_min_duration_sample:'-1',log_statement_sample_rate:'0',log_transaction_sample_rate:'0',
      log_parameter_max_length:'0',log_parameter_max_length_on_error:'0',password_encryption:'scram-sha-256'})) {
      await client.query('SELECT set_config($1,$2,false)',[name,value]);
    }
    const { rows:[audit] } = await client.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgaudit') OR position('pgaudit' in current_setting('shared_preload_libraries'))>0 AS present");
    if (audit.present) throw new Error();
    await client.query('BEGIN'); transaction = true;
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
    await client.query('SELECT pg_advisory_xact_lock(21092026, 1)');
    await client.query(`CREATE FUNCTION pg_temp.provision_pm_roles(r_name text,r_password text,m_name text,m_password text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $body$
DECLARE owner_name text; owner_super boolean;
BEGIN
 SELECT r.rolname,r.rolsuper INTO STRICT owner_name,owner_super FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database();
 IF owner_super OR EXISTS(SELECT 1 FROM pg_roles WHERE lower(rolname) IN (lower(r_name),lower(m_name))) THEN RAISE EXCEPTION 'ROLE_PREFLIGHT_FAILED'; END IF;
 IF to_regclass('public._prisma_migrations') IS NULL THEN RAISE EXCEPTION 'MIGRATION_TABLE_REQUIRED'; END IF;
 EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',r_name,r_password);
 EXECUTE format('CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',m_name,m_password);
 EXECUTE format('GRANT %I TO %I',owner_name,m_name);
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),r_name);
 REVOKE CREATE ON SCHEMA public FROM PUBLIC;
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',r_name);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO %I',r_name);
 EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON TABLE public._prisma_migrations FROM %I',r_name);
 EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',r_name);
 EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO %I',owner_name,r_name);
 EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO %I',owner_name,r_name);
 EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO %I',m_name,r_name);
 EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO %I',m_name,r_name);
 IF has_schema_privilege(r_name,'public','CREATE') OR has_table_privilege(r_name,'public._prisma_migrations','INSERT') OR NOT pg_has_role(m_name,owner_name,'USAGE') THEN RAISE EXCEPTION 'ROLE_POSTCHECK_FAILED'; END IF;
END $body$`);
    await client.query('SELECT pg_temp.provision_pm_roles($1,$2,$3,$4)',[runtime.username,runtime.password,migration.username,migration.password]);
    await client.query('DROP FUNCTION pg_temp.provision_pm_roles(text,text,text,text)');
    await client.query('COMMIT'); transaction = false;
    return { created: 2, runtimeDdl: false };
  } catch {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw new Error('PM_ROLE_PROVISION_FAILED');
  }
}

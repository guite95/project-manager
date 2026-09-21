// Flight previously used the shared superuser. Transfer only its database objects;
// never grant that shared role or run cluster-wide REASSIGN OWNED.
export async function provisionFlightRoles(client, { runtime, migration, expectedDatabase = 'flight-db' }) {
  let transaction = false;
  try {
    if (!['flight-db', 'project_management_test'].includes(expectedDatabase)) throw new Error();
    for (const account of [runtime, migration]) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(account?.username ?? '') || typeof account.password !== 'string'
        || account.password.length < 12 || account.password.length > 32 || !/^[\x21-\x7e]+$/.test(account.password)) throw new Error();
    }
    if (runtime.username.toLowerCase() === migration.username.toLowerCase()) throw new Error();
    const {rows:[identity]} = await client.query('SELECT current_database() AS db, rolsuper FROM pg_roles WHERE rolname=current_user');
    if (identity?.db !== expectedDatabase || identity.rolsuper !== true) throw new Error();
    for (const [name,value] of Object.entries({log_statement:'none',log_min_duration_statement:'-1',log_duration:'off',log_min_error_statement:'panic',
      log_min_messages:'panic',log_error_verbosity:'terse',log_min_duration_sample:'-1',log_statement_sample_rate:'0',log_transaction_sample_rate:'0',
      log_parameter_max_length:'0',log_parameter_max_length_on_error:'0',password_encryption:'scram-sha-256'})) {
      await client.query('SELECT set_config($1,$2,false)',[name,value]);
    }
    const {rows:[audit]} = await client.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgaudit') OR position('pgaudit' in current_setting('shared_preload_libraries'))>0 AS present");
    if (audit.present) throw new Error();
    await client.query('BEGIN'); transaction = true;
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
    await client.query('SELECT pg_advisory_xact_lock(21092026, 2)');
    await client.query(`CREATE FUNCTION pg_temp.provision_flight_roles(r_name text,r_password text,m_name text,m_password text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $body$
DECLARE obj record;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE lower(rolname) IN (lower(r_name),lower(m_name))) THEN RAISE EXCEPTION 'ROLE_COLLISION'; END IF;
 IF to_regclass('public.alembic_version') IS NULL THEN RAISE EXCEPTION 'MIGRATION_TABLE_REQUIRED'; END IF;
 -- Fail closed if production inventory has acquired unsupported custom objects.
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind NOT IN ('r','i','S'))
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype IN ('e','d')) THEN RAISE EXCEPTION 'OBJECT_INVENTORY_CHANGED'; END IF;
 EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',r_name,r_password);
 EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',m_name,m_password);
 EXECUTE format('ALTER DATABASE %I OWNER TO %I',current_database(),m_name);
 EXECUTE format('ALTER SCHEMA public OWNER TO %I',m_name);
 FOR obj IN SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' LOOP
   EXECUTE format('ALTER TABLE public.%I OWNER TO %I',obj.relname,m_name);
 END LOOP;
 FOR obj IN SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='S' LOOP
   EXECUTE format('ALTER SEQUENCE public.%I OWNER TO %I',obj.relname,m_name);
 END LOOP;
 REVOKE CREATE ON SCHEMA public FROM PUBLIC;
 EXECUTE format('REVOKE CREATE,TEMPORARY ON DATABASE %I FROM PUBLIC',current_database());
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),r_name);
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',r_name);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO %I',r_name);
 EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON TABLE public.alembic_version FROM %I',r_name);
 EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',r_name);
 EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO %I',m_name,r_name);
 EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO %I',m_name,r_name);
 IF has_schema_privilege(r_name,'public','CREATE') OR has_table_privilege(r_name,'public.alembic_version','INSERT') OR NOT has_schema_privilege(m_name,'public','CREATE') THEN RAISE EXCEPTION 'ROLE_POSTCHECK_FAILED'; END IF;
END $body$`);
    await client.query('SELECT pg_temp.provision_flight_roles($1,$2,$3,$4)',[runtime.username,runtime.password,migration.username,migration.password]);
    await client.query('DROP FUNCTION pg_temp.provision_flight_roles(text,text,text,text)');
    await client.query('COMMIT'); transaction = false;
    return {created:2,runtimeDdl:false,sharedAdminUnchanged:true};
  } catch {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw new Error('FLIGHT_ROLE_PROVISION_FAILED');
  }
}

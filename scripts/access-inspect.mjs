/** 읽기 전용. URL/자격증명이나 개인 데이터를 출력하지 않는다. */
import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  const {rows:[tables]}=await pool.query("SELECT to_regclass('access_user') IS NOT NULL AS accounts, to_regclass('access_share') IS NOT NULL AS shares");
  const {rows:[content]}=await pool.query('SELECT (SELECT count(*)::int FROM flow_project) AS projects, (SELECT count(*)::int FROM flow_document) AS documents');
  const {rows:migrations}=await pool.query('SELECT migration_name, finished_at IS NOT NULL AS applied FROM _prisma_migrations ORDER BY migration_name');
  const users=tables.accounts?(await pool.query('SELECT role,count(*)::int AS count FROM access_user GROUP BY role')).rows:[];
  console.log(JSON.stringify({tables,content,migrations,users},null,2));
} finally {await pool.end();}

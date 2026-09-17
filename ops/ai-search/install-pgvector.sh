#!/usr/bin/env bash
# Run on the OCI host after building Dockerfile.pgvector. No DB restart is needed.
set -euo pipefail
expected='postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
[[ "$(docker inspect postgresql --format '{{.Config.Image}}')" == "$expected" ]] || {
  echo 'PostgreSQL image changed; rebuild and review extension ABI first.' >&2; exit 1;
}
cd "$HOME/project-management"
umask 077
mkdir -p backups
backup="backups/pre-pgvector-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec postgresql sh -c 'exec pg_dump -U "$POSTGRES_USER" -d project_management -Fc' > "$backup"
test -s "$backup"
docker exec -i postgresql pg_restore --list < "$backup" > "$backup.list"
test -s "$backup.list"
sha256sum "$backup"

artifact=$(docker create project-management-pgvector:16.15-0.8.1 /unused)
staging=$(mktemp -d)
trap 'docker rm "$artifact" >/dev/null; rm -rf "$staging"' EXIT
docker cp "$artifact:/usr/local/lib/postgresql/vector.so" "$staging/vector.so"
docker cp "$artifact:/usr/local/share/postgresql/extension/vector.control" "$staging/vector.control"
docker cp "$artifact:/usr/local/share/postgresql/extension/vector--0.8.1.sql" "$staging/vector--0.8.1.sql"
sudo install -d -m 755 /opt/shared-infra/pgvector16-0.8.1
sudo install -m 644 "$staging/"* /opt/shared-infra/pgvector16-0.8.1/

# Persist only the three additive extension files; preserve the base image's other extensions.
sudo python3 - <<'PY'
from pathlib import Path
import re, shutil, datetime
p = Path('/opt/shared-infra/docker-compose.yml')
text = p.read_text()
block = re.search(r'(?ms)^  postgresql:\n.*?(?=^  [a-zA-Z0-9_-]+:|\Z)', text)
if not block:
    raise SystemExit('PostgreSQL compose block not found')
mounts = [
    '/opt/shared-infra/pgvector16-0.8.1/vector.so:/usr/local/lib/postgresql/vector.so:ro',
    '/opt/shared-infra/pgvector16-0.8.1/vector.control:/usr/local/share/postgresql/extension/vector.control:ro',
    '/opt/shared-infra/pgvector16-0.8.1/vector--0.8.1.sql:/usr/local/share/postgresql/extension/vector--0.8.1.sql:ro',
]
updated = block.group()
missing = [mount for mount in mounts if mount not in updated]
if missing:
    if updated.count('    volumes:\n') != 1:
        raise SystemExit('Unexpected PostgreSQL volume layout')
    updated = updated.replace('    volumes:\n', '    volumes:\n' + ''.join('      - ' + m + '\n' for m in missing), 1)
    backup = p.with_name('docker-compose.yml.pre-pgvector-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    shutil.copy2(p, backup)
    p.write_text(text[:block.start()] + updated + text[block.end():])
PY
sudo docker compose -f /opt/shared-infra/docker-compose.yml config --quiet

# The current container receives the same files, so other shared-DB clients stay connected.
docker cp "$staging/vector.so" postgresql:/usr/local/lib/postgresql/vector.so
docker cp "$staging/vector.control" postgresql:/usr/local/share/postgresql/extension/vector.control
docker cp "$staging/vector--0.8.1.sql" postgresql:/usr/local/share/postgresql/extension/vector--0.8.1.sql
docker exec -i postgresql sh -c 'exec psql -U "$POSTGRES_USER" -d project_management -X -v ON_ERROR_STOP=1' <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extname,extversion FROM pg_extension WHERE extname='vector';
SQL
# Create application-owned derived table/index with the existing application role.
docker exec -i project-management node --input-type=module - <<'JS'
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile('scripts/sql/ai-ops-vector.sql', 'utf8'));
  await client.query('COMMIT');
  console.log('pgvector table and 1536-dimensional HNSW index ready');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Vector schema activation failed:', error.code);
  process.exitCode = 1;
} finally { await client.end(); }
JS

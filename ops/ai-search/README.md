# OCI embedding runtime

The runtime uses the existing PostgreSQL 16.15 container and the existing OCI instance.
No personal ADC, service-account JSON key, new DB container, or public DB port is required.

## Identity

`adc.json` is a **non-secret** external-account configuration generated with gcloud.
GCP pool `pm-oci`, provider `oci-instance`, trusts the inspected OCI intermediate CA and
restricts `assertion.subject.dn.cn` to this instance's exact OCID. Only that subject has
`roles/iam.workloadIdentityUser` on the embedding service account. Its project role is
`roles/aiplatform.user`.

`refresh-oci-certificate.py` fetches short-lived identity material from OCI IMDSv2 on the
same host. It checks the instance, pinned CA, expiry and key/certificate match, then
atomically publishes immutable generation paths in `/run/project-management-wif`.
This root-only directory is runtime memory storage and is mounted read-only in the app.
The Google auth library reads the latest certificate when refreshing tokens. Expired
runtime certificate generations are removed; original AI sessions are unaffected.

Install the Python script at `/usr/local/lib/project-management/refresh-oci-certificate.py`
and `adc.json` at `/etc/project-management-wif-adc.json`. The root-owned, mode-600 file
`/etc/project-management-wif.conf` contains the **non-secret** `OCI_INSTANCE_ID` and
`OCI_CA_SHA256` verified during provisioning. Install the accompanying systemd service
and timer under `/etc/systemd/system`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable project-management-wif.service
sudo systemctl start project-management-wif.service
sudo systemctl enable --now project-management-wif.timer
```

The timer refreshes every ten minutes and recreates runtime files after reboot.
Enable `project-management-runtime.service` to start the existing app container after
Docker and initial certificate preparation at boot. This also recovers a container whose
runtime bind mount was unavailable when Docker first restored its containers.
The inspected intermediate CA expires in September 2027. If OCI changes that CA,
renewal fails closed: inspect the new public certificate through personal SSH, update
the GCP provider trust store and the pinned hash together, then restart the service.
For GCP's trust-store input, remove the final newline from each PEM certificate
(`pem.strip()`); other certificate consumers still use normal PEM files.

Set `COMPOSE_FILE=docker-compose.yml:docker-compose.wif.yml` in the server's existing
`.env`, alongside the non-secret project/model/global/1536 settings. The deployment
workflow uploads both Compose files. Local development keeps its separate local ADC.

## pgvector

Build `Dockerfile.pgvector` on the ARM64 host using the exact current PostgreSQL image.
It pins pgvector 0.8.1's source commit and archive SHA-256 and disables native CPU flags.
Then run `bash ops/ai-search/install-pgvector.sh` on the host. The installer:

1. Checks the current PostgreSQL image and makes a verified custom-format DB backup.
2. Adds the library, control file and version SQL without restarting PostgreSQL.
3. Persists three read-only mounts in `/opt/shared-infra/docker-compose.yml`, preserving
   the existing data volume, network, credentials and other extension files.
4. Creates the extension as DBA and the derived vector table/HNSW index as the app role.

Artifacts live under `/opt/shared-infra/pgvector16-0.8.1`. The old Compose file is backed
up next to the shared Compose file. Before upgrading PostgreSQL, rebuild these artifacts
against the new image; a major-version upgrade needs its own reviewed DB procedure.

## Worker

After WIF and pgvector are verified:

```bash
docker exec project-management node scripts/ai-ops-search.mjs backfill --apply --batches 100
sudo systemctl enable --now project-management-embedding.timer
sudo systemctl start --no-block project-management-embedding.service
docker exec project-management node scripts/ai-ops-search.mjs inspect
```

Install both embedding unit files first. The worker resumes durable jobs and exits after
draining currently available work (or 10,000 batches). The timer runs again one minute
after exit to discover new sessions and ready retries. systemd prevents overlapping runs
of the same service. A deployment may interrupt a batch; expired leases are reclaimed.

Use `journalctl -u project-management-embedding.service` for counts/error codes and
`systemctl list-timers project-management-*` for scheduling. Logs contain no message
bodies, vectors, tokens or private keys. `FAILED` jobs require diagnosis, then explicit
`docker exec project-management node scripts/ai-ops-search.mjs retry --apply`.

Completion means the active profile has no PENDING/PROCESSING/FAILED jobs and
`pendingSessions=0`; new messages arriving afterward are processed incrementally.

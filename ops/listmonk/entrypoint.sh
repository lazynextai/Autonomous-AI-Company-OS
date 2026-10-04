#!/bin/bash
set -e
# CF's port check kills the container if nothing listens on the declared port
# fast enough — bind nginx :9000 FIRST, before the boot work (same trap as
# postiz-stack). /run must exist before nginx writes its pid file.
mkdir -p /data/pg /data/logs /run/supervisord /run/nginx /var/lib/nginx/logs /var/run/postgresql /run/postgresql
nginx 2>/data/logs/nginx-start.err.log || true
chown -R postgres:postgres /data/pg /var/run/postgresql /run/postgresql

# Boot beacon: timestamped markers into R2 at each phase.
beacon() {
  [ -z "${R2_ACCESS_KEY_ID:-}" ] && return 0
  echo "$1" > /tmp/beacon.txt
  RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  RCLONE_CONFIG_R2_REGION=auto RCLONE_CONFIG_R2_ACL=private \
  rclone --contimeout 10s --timeout 20s --retries 1 \
    copyto /tmp/beacon.txt "r2:${R2_BUCKET:-lazynext-media}/listmonk-boot/$(hostname)-$1.txt" 2>/dev/null || true
}
beacon start
if wget -qO- --timeout=5 http://127.0.0.1:9000/__health 2>/dev/null | grep -q ok; then
  beacon nginx-up
else
  cp /var/lib/nginx/logs/error.log /data/logs/nginx.error.log 2>/dev/null || true
  beacon nginx-dead
fi

export PGPASS="${POSTGRES_LOCAL_PASSWORD:-listmonk-local-pw}"

# --- Postgres bootstrap: restore the R2 snapshot if PGDATA is empty ---
if [ ! -s /data/pg/PG_VERSION ]; then
  beacon restore-attempt
  /opt/r2-restore.sh || true
fi
PGOPTS='-c listen_addresses=127.0.0.1 -c dynamic_shared_memory_type=mmap'
if [ ! -s /data/pg/PG_VERSION ]; then
  beacon initdb-start
  su-exec postgres initdb -D /data/pg -U postgres -A trust > /tmp/initdb.log 2>&1 || beacon initdb-fail
fi
beacon pgctl-start
rm -f /data/pg/postmaster.pid /data/pg/postmaster.opts
su-exec postgres timeout 120 pg_ctl -D /data/pg -o "$PGOPTS" -l /data/pg/pg.log -w -t 90 start > /tmp/pgctl.log 2>&1 || {
  cp /tmp/pgctl.log /data/logs/pgctl.log 2>/dev/null
  cp /data/pg/pg.log /data/logs/pg.log 2>/dev/null
  beacon pg-fail
}
beacon pgctl-done
if psql -h 127.0.0.1 -U postgres -c "SELECT 1" >/dev/null 2>&1; then
  psql -h 127.0.0.1 -U postgres -c "ALTER USER postgres PASSWORD '$PGPASS'" || true
  psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE listmonk" || true
  beacon pg-ready
else
  beacon pg-not-ready
fi

# --- Listmonk config: TOML with env-driven admin + DB creds.
# admin_username/admin_password in TOML auto-creates the superadmin on
# --install (min 3 / min 8 chars; without it listmonk falls back to a
# first-run web wizard, which we can't drive headlessly).
ADMIN_USER="${LISTMONK_ADMIN_USER:-admin}"
ADMIN_PASS="${LISTMONK_ADMIN_PASSWORD:-}"
cat > /etc/listmonk.toml <<EOF
[app]
address = "0.0.0.0:9001"
admin_username = "$ADMIN_USER"
admin_password = "$ADMIN_PASS"

[db]
host = "127.0.0.1"
port = 5432
user = "postgres"
password = "$PGPASS"
database = "listmonk"
ssl_mode = "disable"
max_open = 10
max_idle = 5
max_lifetime = "300s"
EOF

# --- Schema install (once) ---
if ! PGPASSWORD="$PGPASS" psql -h 127.0.0.1 -U postgres -d listmonk -tc "SELECT 1 FROM lists LIMIT 1" >/dev/null 2>&1; then
  beacon listmonk-install
  /usr/local/bin/listmonk --install --idempotent --config /etc/listmonk.toml --yes >> /tmp/listmonk-install.log 2>&1 || beacon install-fail
fi

# --- Seed the API user for Postiz (basic-auth username:token) ---
# v6 api users store sha256hex(token) in users.password, password_login=false,
# email '<user>@api' — verified live: direct INSERT works, and listmonk caches
# creds at boot so seeding here (before supervisord starts it) is picked up.
if [ -n "${LISTMONK_API_USER:-}" ] && [ -n "${LISTMONK_API_TOKEN:-}" ]; then
  HASH=$(printf '%s' "$LISTMONK_API_TOKEN" | sha256sum | cut -d' ' -f1)
  ROLE=$(PGPASSWORD="$PGPASS" psql -h 127.0.0.1 -U postgres -d listmonk -Atc \
    "SELECT id FROM roles WHERE type='user' AND name='Super Admin' LIMIT 1" 2>/dev/null || true)
  ROLE=${ROLE:-1}
  PGPASSWORD="$PGPASS" psql -h 127.0.0.1 -U postgres -d listmonk -c \
    "INSERT INTO users (username, password_login, password, email, name, type, user_role_id, status)
     VALUES ('$LISTMONK_API_USER', false, '$HASH', '$LISTMONK_API_USER@api', 'Postiz API', 'api', $ROLE, 'enabled')
     ON CONFLICT (username) DO UPDATE SET password=EXCLUDED.password, user_role_id=EXCLUDED.user_role_id, status='enabled'" \
    || beacon apiseed-fail
  beacon apiseed-done
fi

beacon supervisord-exec

# Best-effort backup on shutdown so the last state lands in R2.
trap '/opt/backup.sh || true' TERM

exec /usr/bin/supervisord -c /etc/supervisord.conf

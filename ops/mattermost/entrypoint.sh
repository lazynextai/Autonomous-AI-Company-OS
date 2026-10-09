#!/bin/bash
set -e
# CF's port check kills the container if nothing listens on the declared port
# fast enough — bind nginx :9000 FIRST, before the boot work (same trap as
# listmonk/postiz). /run must exist before nginx writes its pid file.
mkdir -p /data/pg /data/logs /data/files /run/supervisord /run/nginx /var/lib/nginx/logs /var/run/postgresql /run/postgresql
nginx 2>/data/logs/nginx-start.err.log || true
chown -R postgres:postgres /data/pg /data/files /var/run/postgresql /run/postgresql

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
    copyto /tmp/beacon.txt "r2:${R2_BUCKET:-lazynext-media}/mm-boot/$(hostname)-$1.txt" 2>/dev/null || true
}
beacon start
if wget -qO- --timeout=5 http://127.0.0.1:9000/__health 2>/dev/null | grep -q ok; then
  beacon nginx-up
else
  cp /var/lib/nginx/logs/error.log /data/logs/nginx.error.log 2>/dev/null || true
  beacon nginx-dead
fi

export PGPASS="${POSTGRES_LOCAL_PASSWORD:-mm-local-pw}"

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
  psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE mattermost" || true
  beacon pg-ready
else
  beacon pg-not-ready
fi

beacon supervisord-exec

# Best-effort backup on shutdown so the last state lands in R2.
trap '/opt/backup.sh || true' TERM

exec /usr/bin/supervisord -c /etc/supervisord.conf

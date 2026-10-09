#!/bin/bash
# Restore the latest pg_dumpall snapshot from R2 into a fresh cluster.
# No-op when creds or the backup don't exist — entrypoint falls through to
# initdb + CREATE DATABASE.
set -u
[ -z "${R2_ACCESS_KEY_ID:-}" ] && exit 0
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_REGION=auto
export RCLONE_CONFIG_R2_ACL=private

rclone copyto "r2:${R2_BUCKET:-lazynext-media}/mattermost-backup/latest.sql.gz" /tmp/restore.sql.gz 2>/dev/null || exit 0
su-exec postgres initdb -D /data/pg -U postgres -A trust >/dev/null
su-exec postgres pg_ctl -D /data/pg -o '-c listen_addresses=127.0.0.1' -w start
zcat /tmp/restore.sql.gz | PGPASSWORD="$PGPASS" psql -h 127.0.0.1 -U postgres || true
psql -h 127.0.0.1 -U postgres -c "ALTER USER postgres PASSWORD '$PGPASS'"
psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE mattermost" || true
su-exec postgres pg_ctl -D /data/pg -w stop || true
rm -f /tmp/restore.sql.gz
# File store restore.
rclone copyto "r2:${R2_BUCKET:-lazynext-media}/mattermost-backup/files-latest.tgz" /tmp/mmfiles.tgz 2>/dev/null && \
  tar -xzf /tmp/mmfiles.tgz -C /data 2>/dev/null || true
rm -f /tmp/mmfiles.tgz

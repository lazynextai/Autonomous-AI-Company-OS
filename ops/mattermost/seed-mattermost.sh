#!/bin/bash
# One-shot seed (runs under supervisord with autorestart=false): waits for
# mattermost health, then creates the admin user + team + incoming webhook
# via mmctl local mode, and beacons the webhook URL to R2 + /data so the
# operator can wire conn:mattermost without a UI.
set -u
export PGPASS="${POSTGRES_LOCAL_PASSWORD:-mm-local-pw}"
MMCTL="/opt/mattermost-app/bin/mmctl --local"
LOCAL_SOCK="/var/tmp/mattermost_local.socket"

beacon() {
  [ -z "${R2_ACCESS_KEY_ID:-}" ] && return 0
  echo "$1" > /tmp/seedbeacon.txt
  RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  RCLONE_CONFIG_R2_REGION=auto RCLONE_CONFIG_R2_ACL=private \
  rclone --contimeout 10s --timeout 20s --retries 1 \
    copyto /tmp/seedbeacon.txt "r2:${R2_BUCKET:-lazynext-media}/mm-boot/$(hostname)-seed-$1.txt" 2>/dev/null || true
}

# Wait for mattermost health (server boot + schema init can take a while).
for i in $(seq 1 120); do
  if curl -fsS --max-time 3 http://127.0.0.1:8065/api/v4/system/ping 2>/dev/null | grep -q '"status":"OK"'; then
    break
  fi
  sleep 5
done
curl -fsS --max-time 3 http://127.0.0.1:8065/api/v4/system/ping | grep -q '"status":"OK"' || { beacon mm-never-up; exit 1; }
beacon mm-up

ADMIN_USER="${MM_ADMIN_USER:-lazynext}"
ADMIN_PASS="${MM_ADMIN_PASSWORD:-}"
SITE="${MM_SITE_URL:-https://mattermost.lazynext.com}"

# Idempotent seed: skip if webhook id was already recorded.
if [ -s /data/webhook_url.txt ]; then
  beacon already-seeded
  exit 0
fi

$MMCTL user create --email support@lazynext.com --username "$ADMIN_USER" --password "$ADMIN_PASS" --system-admin 2>&1 | tee /data/seed-user.log || true
$MMCTL team create --name lazynext --display-name "Lazynext" 2>&1 | tee /data/seed-team.log || true
$MMCTL team users add lazynext "$ADMIN_USER" 2>&1 | tee -a /data/seed-team.log || true
# Default channel town-square exists on every new team.
OUT=$($MMCTL webhook create-incoming --channel lazynext:town-square --display-name "Lazynext Bot" --user "$ADMIN_USER" 2>&1)
echo "$OUT" > /data/seed-webhook.log
HOOK_ID=$(echo "$OUT" | grep -ioE 'id[=: ]+[a-z0-9]{26}' | grep -oE '[a-z0-9]{26}' | head -1)
if [ -z "$HOOK_ID" ]; then
  # Fallback: plain-token scan of the output.
  HOOK_ID=$(echo "$OUT" | grep -oE '\b[a-z0-9]{26}\b' | head -1)
fi
if [ -n "$HOOK_ID" ]; then
  echo "$SITE/hooks/$HOOK_ID" > /data/webhook_url.txt
  beacon "webhook-$HOOK_ID"
else
  beacon webhook-fail
fi
beacon seed-done

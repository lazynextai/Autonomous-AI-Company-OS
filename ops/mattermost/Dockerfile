# Mattermost Team Edition all-in-one Cloudflare Container — ZERO external
# services (same pattern as ops/listmonk, ops/postiz).
# CF containers expose only HTTP fetch ingress (no inter-container TCP), so
# everything runs on 127.0.0.1 inside one container via supervisord:
#   postgres (alpine pkg) :5432  — PGDATA in container fs (/data/pg)
#   mattermost :8065           — Go binary + mmctl, team edition tarball
#   nginx :9000                — declared port, binds INSTANTLY (CF port
#                                check kills the container otherwise), then
#                                proxies to mattermost once it is up
#   backup loop                — pg_dumpall → R2 every 15m (+ on SIGTERM)
# Durability: container fs survives sleep; R2 snapshot survives eviction.
FROM postgres:16-alpine

# gcompat/libc6-compat: the mattermost binary is glibc-linked — musl-only
# images fail with "exec failed: no such file or directory".
RUN apk add --no-cache nginx supervisor curl rclone bash ca-certificates su-exec gcompat libc6-compat \
    && mkdir -p /data/pg /data/logs /data/files /run/supervisord /run/nginx /var/lib/nginx/logs \
    && chown -R postgres:postgres /data/pg

# Team Edition tarball (~300MB) — extract in one layer; binary+client are
# already compressed-ish so the layer stays under the CF provision limit.
RUN curl -fsSL https://releases.mattermost.com/10.11.4/mattermost-team-10.11.4-linux-amd64.tar.gz \
      | tar xz -C /opt \
    && mv /opt/mattermost /opt/mattermost-app \
    && mkdir -p /opt/mattermost-app/logs /opt/mattermost-app/data \
    && chown -R postgres:postgres /opt/mattermost-app

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisord.conf
COPY entrypoint.sh backup.sh r2-restore.sh run-mattermost.sh seed-mattermost.sh /opt/
RUN chmod 755 /opt/entrypoint.sh /opt/backup.sh /opt/r2-restore.sh /opt/run-mattermost.sh /opt/seed-mattermost.sh

ENTRYPOINT ["/opt/entrypoint.sh"]

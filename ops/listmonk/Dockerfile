# Listmonk all-in-one Cloudflare Container — ZERO external services.
# CF containers expose only HTTP fetch ingress (no inter-container TCP), so
# everything runs on 127.0.0.1 inside one container via supervisord:
#   postgres (alpine pkg) :5432  — PGDATA in container fs (/data/pg)
#   listmonk :9001               — Go binary, embedded static + schema
#   nginx :9000                  — declared port, binds INSTANTLY (CF port
#                                  check kills the container otherwise), then
#                                  proxies to listmonk once it is up
#   backup loop                  — pg_dumpall → R2 every 15m (+ on SIGTERM)
# Durability: container fs survives sleep; R2 snapshot survives eviction.
#
# Base postgres:16-alpine keeps the image small enough for plain layers —
# no splitfs banding needed (postiz needed it at ~1.4GB/layer).
FROM postgres:16-alpine

RUN apk add --no-cache nginx supervisor curl rclone apache2-utils bash ca-certificates \
    && curl -fsSL https://github.com/knadh/listmonk/releases/download/v6.2.0/listmonk_6.2.0_linux_amd64.tar.gz \
       | tar xz -C /usr/local/bin listmonk \
    && chmod 755 /usr/local/bin/listmonk \
    && mkdir -p /data/pg /data/logs /run/supervisord /run/nginx /var/lib/nginx/logs \
    && chown -R postgres:postgres /data/pg

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisord.conf
COPY entrypoint.sh backup.sh r2-restore.sh /opt/
RUN chmod 755 /opt/entrypoint.sh /opt/backup.sh /opt/r2-restore.sh

ENTRYPOINT ["/opt/entrypoint.sh"]

# Lazynext AI Slop Checker — container image
#
# Multi-stage build: dev stage has nothing to install (zero npm deps), so
# the production stage is a slim node:20-alpine running the plain-Node API
# (api/server.js). The Workers entry (api/worker.js) is the edge alternative
# and does not ship in this image (see docs/DEPLOYMENT.md).
#
# Build:   docker build -t lazynext/ai-slop-checker:1.2.0 .
# Run:     docker run --rm -p 3000:3000 -e PORT=3000 lazynext/ai-slop-checker:1.2.0
# Health:  /health (used by the HEALTHCHECK below)

# --- stage 1: base (also the final image — nothing to compile) -----------
FROM node:20-alpine

# Keep the container non-root.
RUN addgroup -S slop && adduser -S slop -G slop

WORKDIR /app

# Copy the whole product (it has zero runtime dependencies; the lockfile is
# metadata only, but copying it supports future installs without a rebuild).
COPY package.json package-lock.json ./
COPY api ./api
COPY data ./data
COPY src ./src
COPY web ./web
COPY assets ./assets
COPY llms.txt ./
COPY demo ./demo

USER slop

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => { if (!r.ok) process.exit(1); return r.json(); }).then(j => process.exit(j.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "api/server.js"]
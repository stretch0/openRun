# syntax=docker/dockerfile:1

# ---- Build: install everything and build the API bundle and the PWA ----
# The full image includes python3, make and g++ for building better-sqlite3
# when no prebuilt binary matches the platform.
# Pinned by digest; Dependabot proposes updates.
FROM node:25-bookworm@sha256:78839ac448c23517f8eab2e8f7943d9b4f73979eb7f8bed2c73dbf72ff869e7b AS build
WORKDIR /src
ENV NX_DAEMON=false NX_NO_CLOUD=true NX_SKIP_NX_CACHE=true
COPY . .
RUN npm ci
RUN npx nx run-many -t build -p web && npx nx run api:prune
# Install the API's production dependencies next to its bundle. Optional
# dependencies stay in: they carry sharp's prebuilt libvips for this platform.
RUN cd apps/api/dist && npm ci --omit=dev --omit=peer

# ---- Runtime: production dependencies, the bundle, the PWA and migrations ----
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
ARG OPENRUN_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIR=/app/web \
    MIGRATIONS_DIR=/app/migrations \
    OPENRUN_VERSION=${OPENRUN_VERSION}
WORKDIR /app

COPY --from=build /src/apps/api/dist/ ./
COPY --from=build /src/apps/web/dist ./web
COPY --from=build /src/libs/db-migrations/migrations ./migrations
COPY docker-entrypoint.sh /usr/local/bin/openrun-entrypoint

# Starts as root only to fix the data folder's owner; see docker-entrypoint.sh.
# npm, corepack and yarn come with the base image but nothing runs them here,
# and their own dependencies were most of the image's vulnerability reports.
RUN mkdir -p /data && chown node:node /data \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["openrun-entrypoint"]
CMD ["node", "main.js"]

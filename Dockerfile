# syntax=docker/dockerfile:1

# ---- Build: install everything and build the API bundle and the PWA ----
# The full image includes python3, make and g++ for building better-sqlite3
# when no prebuilt binary matches the platform.
FROM node:22-bookworm AS build
WORKDIR /src
ENV NX_DAEMON=false NX_NO_CLOUD=true NX_SKIP_NX_CACHE=true
COPY . .
RUN npm ci
RUN npx nx run-many -t build -p web && npx nx run api:prune
# Install the API's production dependencies next to its bundle.
RUN cd apps/api/dist && npm ci --omit=dev --omit=optional --omit=peer

# ---- Runtime: production dependencies, the bundle, the PWA and migrations ----
FROM node:22-bookworm-slim
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

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.js"]

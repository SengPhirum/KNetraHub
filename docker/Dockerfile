# No `# syntax=` pin: it forces BuildKit to pull the docker/dockerfile
# frontend from Docker Hub on every build, which fails hard on offline or
# flaky networks (TLS handshake timeout). The builtin frontend of any
# modern Docker (23+) supports everything used here, including secret mounts.

FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache ca-certificates

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

ARG NPM_CONFIG_STRICT_SSL=false
ENV NPM_CONFIG_STRICT_SSL=${NPM_CONFIG_STRICT_SSL}
ENV npm_config_strict_ssl=${NPM_CONFIG_STRICT_SSL}

ARG NODE_TLS_REJECT_UNAUTHORIZED=0
ENV NODE_TLS_REJECT_UNAUTHORIZED=${NODE_TLS_REJECT_UNAUTHORIZED}

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then \
      cp /run/secrets/npm_ca /usr/local/share/ca-certificates/npm-ca.crt; \
      update-ca-certificates; \
    fi; \
    corepack enable pnpm; \
    pnpm install --frozen-lockfile

COPY . .
# The SSR/Nitro server bundle for this multi-app monorepo exceeds Node's default
# ~2 GB old-space heap on a clean container build (the client builds fine; the
# server transform is what OOMs). Give the build headroom. Override on a smaller
# or larger builder with --build-arg NODE_BUILD_MEMORY=<MB>.
ARG NODE_BUILD_MEMORY=4096
RUN NODE_OPTIONS=--max-old-space-size=${NODE_BUILD_MEMORY} pnpm run build

FROM node:22-alpine
WORKDIR /app

# iputils provides the full-featured `ping` binary the Network poller/discovery
# shell out to (busybox ping output isn't reliably parsed by the ping library).
# postgresql17-client provides pg_dump/pg_restore for Admin > System >
# Maintenance backup & restore (matches the TimescaleDB pg17 server).
RUN apk add --no-cache ca-certificates iputils postgresql17-client

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /usr/local/share/ca-certificates /usr/local/share/ca-certificates
COPY --from=build /app/.output ./.output
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
# start-period gives the entrypoint's DB wait + first migration room to run
# before a slow start counts as unhealthy; Swarm's start-first rolling
# update (docker-compose.yml) uses this to gate promoting the new task.
HEALTHCHECK --interval=10s --timeout=3s --start-period=45s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/system/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]

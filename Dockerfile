# syntax=docker/dockerfile:1.7

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
RUN pnpm run build

FROM node:22-alpine
WORKDIR /app

# iputils provides the full-featured `ping` binary the Network poller/discovery
# shell out to (busybox ping output isn't reliably parsed by the ping library).
RUN apk add --no-cache ca-certificates iputils

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /usr/local/share/ca-certificates /usr/local/share/ca-certificates
COPY --from=build /app/.output ./.output
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]

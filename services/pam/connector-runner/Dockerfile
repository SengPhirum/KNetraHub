# PAM connector-runner. Runs connectors out-of-process as a non-root user.
# Signed connector bundles are baked at /connectors (verified against the
# control-plane registry by digest+signature before loading). ssh2 and other
# connector transports are installed under /app/node_modules and exposed to the
# bundles via NODE_PATH. Designed for a read-only rootfs + writable tmpfs /tmp.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY runner.mjs sandbox.mjs ./
COPY connectors /connectors
RUN addgroup -S pam && adduser -S pam -G pam && chown -R pam:pam /app /connectors
USER pam
ENV PAM_CONNECTORS_DIR=/connectors \
    NODE_PATH=/app/node_modules
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "runner.mjs", "--healthcheck"]
ENTRYPOINT ["node", "runner.mjs"]

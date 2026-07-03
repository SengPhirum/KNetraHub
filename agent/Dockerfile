# Minimal standalone image for knetrahub-agent. Deployed with `deploy: mode:
# global` (one task per swarm node) to report that node's usage back to the
# knetrahub app. Zero npm dependencies - just Node's built-in http module
# talking to the local Docker socket. Distroless: no shell, no package
# manager, smaller attack surface than alpine (entrypoint is already `node`).
FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /agent
COPY index.mjs fileEnv.mjs ./
COPY collectors ./collectors
CMD ["index.mjs"]

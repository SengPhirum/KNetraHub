# PAM connector-runner. Runs custom connectors out-of-process as a non-root
# user. Mount trusted connector bundles read-only at /connectors.
FROM node:22-alpine
RUN addgroup -S pam && adduser -S pam -G pam
WORKDIR /app
COPY runner.mjs sandbox.mjs ./
USER pam
ENTRYPOINT ["node", "runner.mjs"]

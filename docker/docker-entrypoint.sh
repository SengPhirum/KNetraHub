#!/bin/sh
set -eu

log() {
  printf '[knetrahub] %s\n' "$*" >&2
}

# Resolve $1 from ${1}_FILE if that's set instead - the same convention the
# official postgres image uses for POSTGRES_PASSWORD / POSTGRES_PASSWORD_FILE,
# so a value can come from a Docker/Swarm or Kubernetes secret file mounted
# into the container instead of sitting in plaintext in `docker inspect`.
# POSIX sh (this image's /bin/sh is Alpine's ash, not bash) has no ${!var}
# indirection, so this uses eval to look up and set by variable name.
file_env() {
  var="$1"
  file_var="${var}_FILE"
  eval "val=\${${var}:-}"
  eval "file_val=\${${file_var}:-}"

  if [ -n "$val" ] && [ -n "$file_val" ]; then
    log "error: both $var and $file_var are set - use only one"
    exit 1
  fi

  if [ -n "$file_val" ]; then
    if [ ! -f "$file_val" ]; then
      log "error: $file_var points to a file that doesn't exist: $file_val"
      exit 1
    fi
    val="$(cat "$file_val")"
    eval "${var}=\"\$val\""
    export "$var"
    unset "$file_var"
  fi
}

# Every var below accepts a _FILE sibling, matching how the
# timescaledb/postgres image itself supports POSTGRES_PASSWORD_FILE
# alongside POSTGRES_PASSWORD. One name per line, no line continuations -
# $FILE_ENV_VARS is deliberately unquoted below so it word-splits on
# whitespace/newlines; that makes adding/removing a line here safe (no
# trailing "\" to forget, unlike a backslash-continued for-loop list).
FILE_ENV_VARS="
  NUXT_DB_HOST
  NUXT_DB_PORT
  NUXT_DB_NAME
  NUXT_DB_USER
  NUXT_DB_PASSWORD
  NUXT_DB_SSL
  NUXT_DB_POOL_MAX
  NUXT_JWT_SECRET
  NUXT_AGENT_TOKEN
  NUXT_PAM_MASTER_KEY
  NUXT_PAM_RECORDING_SIGNING_KEY
  NUXT_PAM_RECOVERY_MATERIAL
"

for var in $FILE_ENV_VARS; do
  file_env "$var"
done

# Block until Postgres/TimescaleDB is reachable at the TCP level before
# starting the app. Without this, Nitro was already printing "Listening on
# http://[::]:3000" and serving requests while every DB-backed plugin
# (migrations, pollers, seed - server/plugins/*) independently retried for
# up to a minute, spamming EAI_AGAIN/ECONNREFUSED into the logs. This
# absorbs that startup race before node ever starts, so the app doesn't
# come up in a half-ready state in the common case (DB just slow to become
# reachable in the swarm overlay network).
#
# Bounded and fails OPEN (starts the app anyway) once exhausted - this is a
# fast pre-check, not a replacement for server/utils/db.ts's waitForDb(),
# which is still there as the backstop (retry-then-process.exit(1), so the
# orchestrator restarts the container) if Postgres is down for longer than
# this covers.
wait_for_db() {
  host="${NUXT_DB_HOST:-}"
  port="${NUXT_DB_PORT:-5432}"
  if [ -z "$host" ]; then
    return 0
  fi
  if ! command -v nc >/dev/null 2>&1; then
    log "nc not available, skipping database TCP pre-check"
    return 0
  fi

  max_attempts=30
  attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    if nc -z -w2 "$host" "$port" 2>/dev/null; then
      log "Database reachable at ${host}:${port}"
      return 0
    fi
    log "Waiting for database at ${host}:${port} (attempt ${attempt}/${max_attempts})..."
    attempt=$((attempt + 1))
    sleep 2
  done

  log "Database still not reachable at ${host}:${port} after ${max_attempts} attempts - starting anyway, the app will keep retrying"
}

wait_for_db

exec "$@"

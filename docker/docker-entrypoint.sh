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

# Every NUXT_DB_* var (see nuxt.config.ts runtimeConfig.db) accepts a
# _FILE sibling, matching how the timescaledb/postgres image itself supports
# POSTGRES_PASSWORD_FILE alongside POSTGRES_PASSWORD.
for var in \
  NUXT_DB_HOST \
  NUXT_DB_PORT \
  NUXT_DB_NAME \
  NUXT_DB_USER \
  NUXT_DB_PASSWORD \
  NUXT_DB_SSL \
  NUXT_DB_POOL_MAX \
  NUXT_JWT_SECRET \
  NUXT_AGENT_TOKEN
; do
  file_env "$var"
done

exec "$@"

#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

log() {
  printf '[service] %s\n' "$*"
}

warn() {
  printf '[service] WARNING: %s\n' "$*" >&2
}

fail() {
  printf '[service] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

windows_path_to_bash() {
  local path="$1"
  path="${path//$'\r'/}"

  if [[ "${path}" =~ ^([A-Za-z]):\\(.*)$ ]]; then
    local drive="${BASH_REMATCH[1],,}"
    local rest="${BASH_REMATCH[2]//\\//}"
    printf '/mnt/%s/%s\n' "${drive}" "${rest}"
  else
    printf '%s\n' "${path}"
  fi
}

resolve_command() {
  local name="$1"
  local found=""

  if found="$(command -v "${name}" 2>/dev/null)"; then
    printf '%s\n' "${found}"
    return 0
  fi

  if found="$(command -v "${name}.exe" 2>/dev/null)"; then
    printf '%s\n' "${found}"
    return 0
  fi

  if command -v where.exe >/dev/null 2>&1; then
    found="$(where.exe "${name}.exe" 2>/dev/null | tr -d '\r' | head -n 1 || true)"
    if [[ -z "${found}" ]]; then
      found="$(where.exe "${name}" 2>/dev/null | tr -d '\r' | head -n 1 || true)"
    fi
    if [[ -n "${found}" ]]; then
      windows_path_to_bash "${found}"
      return 0
    fi
  fi

  return 1
}

usage() {
  cat <<'EOF'
Usage: ./service.sh <command> [options]

Commands:
  build [options]     Bump version, generate release notes, and build Docker images
  push [options]      Push available local version and latest Docker images
  release [options]   Deprecated alias for build (does not push)
  dev [options]       Run the local disposable Docker Swarm dev environment
  deploy              Build the app image locally and deploy the swarm stack
  qa [options]        Run smart read-only core QA and refresh documentation screenshots
  help                Show this help

Run './service.sh <command> --help' for command-specific options.

Examples:
  ./service.sh build              # rebuild the current version locally
  ./service.sh build --new        # build a new patch version locally
  ./service.sh push               # push local current-version + latest images
  ./service.sh dev --full
  ./service.sh dev --reset
  ./service.sh deploy
  ./service.sh qa --base-url http://localhost:3000
EOF
}

# ── build/push: prepare locally, then publish existing images ───────────────

usage_build() {
  cat <<'EOF'
Usage: ./service.sh build [options]

Build versioned KNetraHub Docker images locally.

Default behavior:
  - keep the current package version (no bump)
  - generate release notes
  - build the app and agent Docker images
  - tag both images with the package version and latest
  - do not push; run './service.sh push' separately

To build a NEW version, pass --new (patch bump) or one of the explicit
bump/version options below.

Options:
  --new                   Build a new version (patch bump)
  --patch                 Bump patch version (same as --new)
  --minor                 Bump minor version
  --major                 Bump major version
  --bump patch|minor|major
  --version x.y.z         Set an exact version
  --no-bump               Keep the current package version (default)
  --registry host         Docker registry host (default: registry.kdsb.com.kh)
  --image name            Image name inside the registry (default: knetrahub/app)
  --agent-image name      Agent image name inside the registry (default: knetrahub/agent)
  --tag-prefix value      Prefix the version Docker tag, e.g. "v" for :v1.2.3
  -h, --help              Show this help

Environment overrides:
  REGISTRY=registry.kdsb.com.kh
  IMAGE_NAME=knetrahub/app
  AGENT_IMAGE_NAME=knetrahub/agent
  VERSION_TAG_PREFIX=
  RELEASE_NOTES_DIR=release-notes
  LATEST_RELEASE_NOTES=release-notes/RELEASE_NOTES.md
  DOCKERFILE=docker/Dockerfile
  NPM_CA_FILE=                 Root CA to trust during the build (for a
                              TLS-intercepting proxy). Defaults to the first
                              docker/dev/certs/*.crt if present.

Examples:
  ./service.sh build                 # rebuild the current version locally
  ./service.sh build --new           # build a new patch version
  ./service.sh build --minor
  ./service.sh build --version 1.2.0
  ./service.sh build --tag-prefix v
EOF
}

usage_push() {
  cat <<'EOF'
Usage: ./service.sh push [options]

Push the locally built KNetraHub images for the current package version.

The app and agent :<version> and :latest tags are checked independently.
Each local tag that exists is pushed. A missing tag produces a warning and is
skipped without preventing other available tags from being pushed.

Options:
  --registry host         Docker registry host (default: registry.kdsb.com.kh)
  --image name            Image name inside the registry (default: knetrahub/app)
  --agent-image name      Agent image name inside the registry (default: knetrahub/agent)
  --tag-prefix value      Prefix the version Docker tag, e.g. "v" for :v1.2.3
  -h, --help              Show this help

Environment overrides:
  REGISTRY=registry.kdsb.com.kh
  IMAGE_NAME=knetrahub/app
  AGENT_IMAGE_NAME=knetrahub/agent
  VERSION_TAG_PREFIX=

Examples:
  ./service.sh push
  ./service.sh push --tag-prefix v
  ./service.sh push --registry registry.example.com
EOF
}

validate_version() {
  "${NODE_BIN}" - "$1" <<'NODE'
const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${version}`)
  process.exit(1)
}
NODE
}

bump_version() {
  "${NODE_BIN}" - "$1" "$2" <<'NODE'
const [version, bump] = process.argv.slice(2)
const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
if (!match) {
  console.error(`Cannot bump non-semver version: ${version}`)
  process.exit(1)
}
let major = Number(match[1])
let minor = Number(match[2])
let patch = Number(match[3])
if (bump === 'major') {
  major += 1
  minor = 0
  patch = 0
} else if (bump === 'minor') {
  minor += 1
  patch = 0
} else {
  patch += 1
}
console.log(`${major}.${minor}.${patch}`)
NODE
}

write_version() {
  "${NODE_BIN}" - "$1" <<'NODE'
const fs = require('fs')
const version = process.argv[2]

for (const file of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(file)) continue

  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  json.version = version

  if (json.packages && json.packages['']) {
    json.packages[''].version = version
  }

  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
}
NODE
}

cmd_build() {
  local REGISTRY="${REGISTRY:-registry.kdsb.com.kh}"
  local IMAGE_NAME="${IMAGE_NAME:-knetrahub/app}"
  local AGENT_IMAGE_NAME="${AGENT_IMAGE_NAME:-}"
  local VERSION_TAG_PREFIX="${VERSION_TAG_PREFIX:-}"
  local RELEASE_NOTES_DIR="${RELEASE_NOTES_DIR:-release-notes}"
  local LATEST_RELEASE_NOTES="${LATEST_RELEASE_NOTES:-release-notes/RELEASE_NOTES.md}"
  local DOCKERFILE="${DOCKERFILE:-docker/Dockerfile}"
  # Corporate / antivirus root CA (Kaspersky, Zscaler, ...) to trust during the
  # image build so pnpm install can fetch through a TLS-intercepting proxy. The
  # Dockerfile reads it as the `npm_ca` build secret. Defaults to the same cert
  # the dev swarm image uses (docker/dev/certs/), auto-detected below if unset.
  local NPM_CA_FILE="${NPM_CA_FILE:-}"

  # No bump by default - a plain `build` rebuilds the current package version.
  # Bumping only happens when explicitly requested
  # via --new / --patch / --minor / --major / --bump / --version.
  local BUMP=""
  local CUSTOM_VERSION=""
  local NO_BUMP="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --new|--new-version)
        # Release a new version; defaults to a patch bump unless a more
        # specific bump flag is also given.
        [[ -n "${BUMP}" ]] || BUMP="patch"
        ;;
      --patch)
        BUMP="patch"
        ;;
      --minor)
        BUMP="minor"
        ;;
      --major)
        BUMP="major"
        ;;
      --bump)
        [[ $# -ge 2 ]] || fail "--bump requires patch, minor, or major"
        BUMP="$2"
        shift
        ;;
      --version)
        [[ $# -ge 2 ]] || fail "--version requires a value"
        CUSTOM_VERSION="$2"
        shift
        ;;
      --no-bump|--skip-bump)
        NO_BUMP="true"
        ;;
      --no-push)
        warn "--no-push is no longer needed; the build command never pushes images"
        ;;
      --registry)
        [[ $# -ge 2 ]] || fail "--registry requires a value"
        REGISTRY="$2"
        shift
        ;;
      --image)
        [[ $# -ge 2 ]] || fail "--image requires a value"
        IMAGE_NAME="$2"
        shift
        ;;
      --agent-image)
        [[ $# -ge 2 ]] || fail "--agent-image requires a value"
        AGENT_IMAGE_NAME="$2"
        shift
        ;;
      --tag-prefix)
        [[ $# -ge 2 ]] || fail "--tag-prefix requires a value"
        VERSION_TAG_PREFIX="$2"
        shift
        ;;
      -h|--help)
        usage_build
        return 0
        ;;
      *)
        fail "Unknown build option: $1"
        ;;
    esac
    shift
  done

  case "${BUMP}" in
    ''|patch|minor|major) ;;
    *) fail "--bump must be patch, minor, or major" ;;
  esac

  if [[ "${NO_BUMP}" == "true" && -n "${BUMP}" ]]; then
    fail "--no-bump conflicts with --new/--patch/--minor/--major/--bump"
  fi

  local NODE_BIN DOCKER_BIN GIT_BIN
  NODE_BIN="$(resolve_command node)" || fail "Missing required command: node"
  DOCKER_BIN="$(resolve_command docker)" || fail "Missing required command: docker"
  GIT_BIN="$(resolve_command git)" || fail "Missing required command: git"

  local current_version
  current_version="$("${NODE_BIN}" -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"

  if [[ -n "${CUSTOM_VERSION}" && "${NO_BUMP}" == "true" ]]; then
    fail "Use either --version or --no-bump, not both"
  fi
  if [[ -n "${CUSTOM_VERSION}" && -n "${BUMP}" ]]; then
    fail "Use either --version or a bump option (--new/--patch/--minor/--major/--bump), not both"
  fi

  local next_version
  if [[ -n "${CUSTOM_VERSION}" ]]; then
    validate_version "${CUSTOM_VERSION}"
    next_version="${CUSTOM_VERSION}"
    log "Setting exact version ${next_version}"
    write_version "${next_version}"
  elif [[ -n "${BUMP}" ]]; then
    next_version="$(bump_version "${current_version}" "${BUMP}")"
    log "Bumping version ${current_version} -> ${next_version}"
    write_version "${next_version}"
  else
    next_version="${current_version}"
    log "Keeping current version ${next_version} (pass --new to build a new version)"
  fi

  if [[ -z "${AGENT_IMAGE_NAME}" ]]; then
    if [[ "${IMAGE_NAME}" == */app ]]; then
      AGENT_IMAGE_NAME="${IMAGE_NAME%/app}/agent"
    else
      AGENT_IMAGE_NAME="${IMAGE_NAME}-agent"
    fi
  fi

  local image="${REGISTRY}/${IMAGE_NAME}"
  local agent_image="${REGISTRY}/${AGENT_IMAGE_NAME}"
  local version_tag="${VERSION_TAG_PREFIX}${next_version}"
  local version_image="${image}:${version_tag}"
  local latest_image="${image}:latest"
  local agent_version_image="${agent_image}:${version_tag}"
  local agent_latest_image="${agent_image}:latest"
  local release_date
  release_date="$(date -u +%Y-%m-%d)"
  local commit_sha
  commit_sha="$("${GIT_BIN}" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
  local last_tag
  last_tag="$("${GIT_BIN}" describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || "${GIT_BIN}" describe --tags --abbrev=0 --match '[0-9]*' 2>/dev/null || true)"

  local changes change_scope
  if [[ -n "${last_tag}" ]]; then
    changes="$("${GIT_BIN}" log --pretty=format:'- %s (%h)' "${last_tag}..HEAD" 2>/dev/null || true)"
    change_scope="since ${last_tag}"
  else
    changes="$("${GIT_BIN}" log --pretty=format:'- %s (%h)' 2>/dev/null || true)"
    change_scope="from repository history"
  fi

  if [[ -z "${changes}" ]]; then
    changes="- No committed changes found ${change_scope}."
  fi

  mkdir -p "${RELEASE_NOTES_DIR}"
  local release_notes_file="${RELEASE_NOTES_DIR}/v${next_version}.md"

  {
    printf '# KNetraHub v%s\n\n' "${next_version}"
    printf 'Date: %s UTC\n\n' "${release_date}"
    printf '## Docker Images\n\n'
    printf -- '- `%s`\n' "${version_image}"
    printf -- '- `%s`\n' "${latest_image}"
    printf -- '- `%s`\n' "${agent_version_image}"
    printf -- '- `%s`\n\n' "${agent_latest_image}"
    printf '## Source\n\n'
    printf -- '- Commit: `%s`\n' "${commit_sha}"
    if [[ -n "${last_tag}" ]]; then
      printf -- '- Previous tag: `%s`\n' "${last_tag}"
    else
      printf -- '- Previous tag: none\n'
    fi
    printf '\n## Changes\n\n'
    printf '%s\n' "${changes}"
  } > "${release_notes_file}"

  cp "${release_notes_file}" "${LATEST_RELEASE_NOTES}"

  log "Release notes written to ${release_notes_file}"
  log "Latest release note copied to ${LATEST_RELEASE_NOTES}"

  # Default to the dev swarm's root CA so a build behind a TLS-intercepting proxy
  # (e.g. Kaspersky) works out of the box; otherwise pnpm install fails with
  # SELF_SIGNED_CERT_IN_CHAIN. No cert present (clean network) -> build normally.
  if [[ -z "${NPM_CA_FILE}" ]]; then
    for candidate in docker/dev/certs/*.crt; do
      if [[ -f "${candidate}" ]]; then
        NPM_CA_FILE="${candidate}"
        break
      fi
    done
  fi

  local build_secret_args=()
  if [[ -n "${NPM_CA_FILE}" ]]; then
    [[ -f "${NPM_CA_FILE}" ]] || fail "NPM_CA_FILE does not exist: ${NPM_CA_FILE}"
    log "Trusting npm CA from ${NPM_CA_FILE} during the image build"
    build_secret_args+=(--secret "id=npm_ca,src=${NPM_CA_FILE}")
  fi

  log "Building ${version_image} and ${latest_image}"

  "${DOCKER_BIN}" build \
    -f "${DOCKERFILE}" \
    ${build_secret_args[@]+"${build_secret_args[@]}"} \
    -t "${version_image}" \
    -t "${latest_image}" \
    .

  log "Building ${agent_version_image} and ${agent_latest_image}"

  "${DOCKER_BIN}" build \
    -t "${agent_version_image}" \
    -t "${agent_latest_image}" \
    ./agent

  log "Build ready locally: ${version_image} + ${agent_version_image}"
  log "Run './service.sh push' to publish the version and latest tags"
}

cmd_push() {
  local REGISTRY="${REGISTRY:-registry.kdsb.com.kh}"
  local IMAGE_NAME="${IMAGE_NAME:-knetrahub/app}"
  local AGENT_IMAGE_NAME="${AGENT_IMAGE_NAME:-}"
  local VERSION_TAG_PREFIX="${VERSION_TAG_PREFIX:-}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --registry)
        [[ $# -ge 2 ]] || fail "--registry requires a value"
        REGISTRY="$2"
        shift
        ;;
      --image)
        [[ $# -ge 2 ]] || fail "--image requires a value"
        IMAGE_NAME="$2"
        shift
        ;;
      --agent-image)
        [[ $# -ge 2 ]] || fail "--agent-image requires a value"
        AGENT_IMAGE_NAME="$2"
        shift
        ;;
      --tag-prefix)
        [[ $# -ge 2 ]] || fail "--tag-prefix requires a value"
        VERSION_TAG_PREFIX="$2"
        shift
        ;;
      -h|--help)
        usage_push
        return 0
        ;;
      *)
        fail "Unknown push option: $1"
        ;;
    esac
    shift
  done

  local NODE_BIN DOCKER_BIN
  NODE_BIN="$(resolve_command node)" || fail "Missing required command: node"
  DOCKER_BIN="$(resolve_command docker)" || fail "Missing required command: docker"

  local current_version
  current_version="$("${NODE_BIN}" -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"
  validate_version "${current_version}"

  if [[ -z "${AGENT_IMAGE_NAME}" ]]; then
    if [[ "${IMAGE_NAME}" == */app ]]; then
      AGENT_IMAGE_NAME="${IMAGE_NAME%/app}/agent"
    else
      AGENT_IMAGE_NAME="${IMAGE_NAME}-agent"
    fi
  fi

  local image="${REGISTRY}/${IMAGE_NAME}"
  local agent_image="${REGISTRY}/${AGENT_IMAGE_NAME}"
  local version_tag="${VERSION_TAG_PREFIX}${current_version}"
  local images=(
    "${image}:${version_tag}"
    "${image}:latest"
    "${agent_image}:${version_tag}"
    "${agent_image}:latest"
  )
  local image_ref
  local pushed=0
  local skipped=0

  for image_ref in "${images[@]}"; do
    if ! "${DOCKER_BIN}" image inspect "${image_ref}" >/dev/null 2>&1; then
      warn "Local Docker image not found: ${image_ref}; skipping"
      ((skipped += 1))
      continue
    fi

    log "Pushing ${image_ref}"
    "${DOCKER_BIN}" push "${image_ref}"
    ((pushed += 1))
  done

  if (( pushed == 0 )); then
    warn "No local Docker images were available to push"
  fi

  log "Push complete: ${pushed} pushed, ${skipped} skipped"
}

# ── dev: local disposable Docker Swarm dev environment ───────────────────────

usage_dev() {
  cat <<'EOF'
Usage: ./service.sh dev [options] [-- <docker compose args>]

Runs the local disposable Docker Swarm dev environment
(docker/docker-compose.dev.yml): one manager + one worker, with KNetraHub and
TimescaleDB running inside. Requires .env (copy .env.example first).

Options:
  (none)        Start it: up --build
  --full        Also start the second worker (compose profile "full")
  --down        Stop and remove containers (volumes are kept)
  --reset       Stop and remove containers AND volumes
  -- <args>     Forward raw args to `docker compose` instead, e.g.:
                  ./service.sh dev -- ps
                  ./service.sh dev -- logs -f swarm-manager
  -h, --help    Show this help

Examples:
  ./service.sh dev
  ./service.sh dev --full
  ./service.sh dev --down
  ./service.sh dev --reset
EOF
}

cmd_dev() {
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --full)
        args+=(--profile full up --build)
        ;;
      --down)
        args+=(down)
        ;;
      --reset)
        args+=(down -v)
        ;;
      -h|--help)
        usage_dev
        return 0
        ;;
      --)
        shift
        args+=("$@")
        break
        ;;
      *)
        args+=("$1")
        ;;
    esac
    shift
  done

  if [[ ${#args[@]} -eq 0 ]]; then
    args=(up --build)
  fi

  local NODE_BIN
  NODE_BIN="$(resolve_command node)" || fail "Missing required command: node"
  "${NODE_BIN}" scripts/dev-swarm.mjs "${args[@]}"
}

# ── deploy: build the app image locally and deploy to the swarm ─────────────

usage_deploy() {
  cat <<'EOF'
Usage: ./service.sh deploy

Builds the app image locally (tag: knetrahub:latest) from docker/Dockerfile
and deploys docker/docker-compose.yml as the "knetrahub" swarm stack. Must
run on a swarm manager node.

For a versioned registry workflow, run './service.sh build' and then
'./service.sh push' instead.
EOF
}

cmd_deploy() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage_deploy
    return 0
  fi

  local DOCKER_BIN
  DOCKER_BIN="$(resolve_command docker)" || fail "Missing required command: docker"

  log "Building knetrahub:latest from docker/Dockerfile"
  "${DOCKER_BIN}" build -f docker/Dockerfile -t knetrahub:latest .

  log "Deploying docker/docker-compose.yml as stack 'knetrahub'"
  "${DOCKER_BIN}" stack deploy -c docker/docker-compose.yml knetrahub
}

# ── smart QA: API/browser checks + documentation screenshots ────────────────────

usage_qa() {
  cat <<'EOF'
Usage: ./service.sh qa [options]

Runs non-destructive API and browser QA against a running KNetraHub instance.
Public health, login, and documentation checks always run. Supplying credentials
also verifies the authenticated app launcher, Docker dashboard, stacks, services,
and nodes. Screenshots use the canonical public/screenshots filenames consumed by
both README.md and the in-app Product tour.

Options:
  --base-url URL          Instance to test (default: http://localhost:3000)
  --scope LEVEL           smoke, core, or full (default: core)
  --username USER         Login user; may also use QA_USERNAME
  --password PASSWORD     Login password; prefer QA_PASSWORD to avoid shell history
  --browser NAME          chromium, firefox, or webkit (default: chromium)
  --screenshots-dir DIR   Screenshot destination (default: public/screenshots)
  --report-dir DIR        JSON report destination (default: .qa-results)
  --headed                Show the browser while QA runs
  --no-screenshots        Run checks without replacing documentation screenshots
  --install-browser       Install the selected Playwright browser before QA
  --init-data             Initialize isolated qa-* fixtures for every module
  --keep-data             Keep initialized fixtures after QA (default: clean up)
  --clean-data            Remove QA fixtures and exit without running checks
  --db-host HOST          Fixture database host (default: localhost)
  --db-port PORT          Fixture database port (default: 5432)
  --db-name NAME          Fixture database name (default: knetrahub)
  --db-user USER          Fixture database user (default: knetrahub)
  --db-password PASS      Fixture DB password; prefer QA_DB_PASSWORD
  -h, --help              Show this help

Environment overrides:
  QA_BASE_URL, QA_SCOPE, QA_USERNAME, QA_PASSWORD, QA_BROWSER,
  QA_SCREENSHOTS_DIR, QA_REPORT_DIR, QA_DB_HOST, QA_DB_PORT, QA_DB_NAME,
  QA_DB_USER, QA_DB_PASSWORD, QA_DB_SSL
  QA_FIXTURE_PASSWORD (default for temporary qa-admin: qa-local-only)

Examples:
  ./service.sh qa
  QA_USERNAME=admin QA_PASSWORD=secret ./service.sh qa --scope core
  ./service.sh qa --init-data --scope full
  ./service.sh qa --clean-data
  ./service.sh qa --base-url https://hub.example.com --scope full --headed
  ./service.sh qa --install-browser --no-screenshots
EOF
}

cmd_qa() {
  local BASE_URL="${QA_BASE_URL:-http://localhost:3000}"
  local SCOPE="${QA_SCOPE:-core}"
  local USERNAME="${QA_USERNAME:-}"
  local PASSWORD="${QA_PASSWORD:-}"
  local BROWSER="${QA_BROWSER:-chromium}"
  local SCREENSHOTS_DIR="${QA_SCREENSHOTS_DIR:-public/screenshots}"
  local REPORT_DIR="${QA_REPORT_DIR:-.qa-results}"
  local HEADED="false"
  local SCREENSHOTS="true"
  local INSTALL_BROWSER="false"
  local INIT_DATA="false"
  local KEEP_DATA="false"
  local CLEAN_DATA="false"
  local DB_HOST="${QA_DB_HOST:-localhost}"
  local DB_PORT="${QA_DB_PORT:-5432}"
  local DB_NAME="${QA_DB_NAME:-knetrahub}"
  local DB_USER="${QA_DB_USER:-knetrahub}"
  local DB_PASSWORD="${QA_DB_PASSWORD:-knetrahub}"
  local DB_SSL="${QA_DB_SSL:-false}"
  local FIXTURE_PASSWORD="${QA_FIXTURE_PASSWORD:-qa-local-only}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --base-url) [[ $# -ge 2 ]] || fail "--base-url requires a value"; BASE_URL="$2"; shift ;;
      --scope) [[ $# -ge 2 ]] || fail "--scope requires smoke, core, or full"; SCOPE="$2"; shift ;;
      --username) [[ $# -ge 2 ]] || fail "--username requires a value"; USERNAME="$2"; shift ;;
      --password) [[ $# -ge 2 ]] || fail "--password requires a value"; PASSWORD="$2"; shift ;;
      --browser) [[ $# -ge 2 ]] || fail "--browser requires a value"; BROWSER="$2"; shift ;;
      --screenshots-dir) [[ $# -ge 2 ]] || fail "--screenshots-dir requires a value"; SCREENSHOTS_DIR="$2"; shift ;;
      --report-dir) [[ $# -ge 2 ]] || fail "--report-dir requires a value"; REPORT_DIR="$2"; shift ;;
      --headed) HEADED="true" ;;
      --no-screenshots) SCREENSHOTS="false" ;;
      --install-browser) INSTALL_BROWSER="true" ;;
      --init-data) INIT_DATA="true" ;;
      --keep-data) KEEP_DATA="true" ;;
      --clean-data) CLEAN_DATA="true" ;;
      --db-host) [[ $# -ge 2 ]] || fail "--db-host requires a value"; DB_HOST="$2"; shift ;;
      --db-port) [[ $# -ge 2 ]] || fail "--db-port requires a value"; DB_PORT="$2"; shift ;;
      --db-name) [[ $# -ge 2 ]] || fail "--db-name requires a value"; DB_NAME="$2"; shift ;;
      --db-user) [[ $# -ge 2 ]] || fail "--db-user requires a value"; DB_USER="$2"; shift ;;
      --db-password) [[ $# -ge 2 ]] || fail "--db-password requires a value"; DB_PASSWORD="$2"; shift ;;
      -h|--help) usage_qa; return 0 ;;
      *) fail "Unknown QA option: $1" ;;
    esac
    shift
  done

  case "${SCOPE}" in smoke|core|full) ;; *) fail "--scope must be smoke, core, or full" ;; esac
  case "${BROWSER}" in chromium|firefox|webkit) ;; *) fail "--browser must be chromium, firefox, or webkit" ;; esac
  [[ -z "${PASSWORD}" || -n "${USERNAME}" ]] || fail "A username is required when a password is supplied"
  [[ "${DB_PORT}" =~ ^[0-9]+$ ]] || fail "--db-port must be numeric"
  [[ "${CLEAN_DATA}" != "true" || "${INIT_DATA}" != "true" ]] || fail "Use either --init-data or --clean-data, not both"

  local NODE_BIN
  NODE_BIN="$(resolve_command node)" || fail "Missing required command: node"

  run_qa_fixtures() {
    QA_DB_HOST="${DB_HOST}" QA_DB_PORT="${DB_PORT}" QA_DB_NAME="${DB_NAME}" \
      QA_DB_USER="${DB_USER}" QA_DB_PASSWORD="${DB_PASSWORD}" QA_DB_SSL="${DB_SSL}" \
      QA_FIXTURE_PASSWORD="${FIXTURE_PASSWORD}" \
      "${NODE_BIN}" scripts/qa-fixtures.mjs "$1"
  }

  if [[ "${INSTALL_BROWSER}" == "true" ]]; then
    log "Installing Playwright ${BROWSER} browser"
    "${NODE_BIN}" node_modules/playwright/cli.js install "${BROWSER}"
  fi

  if [[ "${CLEAN_DATA}" == "true" ]]; then
    run_qa_fixtures clean
    return 0
  fi
  if [[ "${INIT_DATA}" == "true" ]]; then
    log "Initializing isolated QA fixtures for every module"
    run_qa_fixtures init
    if [[ -z "${USERNAME}" && -z "${PASSWORD}" ]]; then
      USERNAME="qa-admin"
      PASSWORD="${FIXTURE_PASSWORD}"
      log "Using the temporary qa-admin account for authenticated module checks"
    fi
  fi

  local args=(
    --base-url "${BASE_URL}" --scope "${SCOPE}" --browser "${BROWSER}"
    --screenshots-dir "${SCREENSHOTS_DIR}" --report-dir "${REPORT_DIR}"
  )
  [[ "${HEADED}" == "true" ]] && args+=(--headed)
  [[ "${SCREENSHOTS}" == "false" ]] && args+=(--no-screenshots)
  [[ -n "${USERNAME}" ]] && args+=(--username "${USERNAME}")
  [[ -n "${PASSWORD}" ]] && args+=(--password-stdin)

  # Keep credentials out of the child process command line. Environment values
  # are read only by the QA runner and are never written to its JSON report.
  local qa_status=0
  set +e
  printf '%s' "${PASSWORD}" | "${NODE_BIN}" scripts/smart-qa.mjs "${args[@]}"
  qa_status=$?
  set -e

  if [[ "${INIT_DATA}" == "true" && "${KEEP_DATA}" != "true" ]]; then
    log "Removing isolated QA fixtures"
    run_qa_fixtures clean || qa_status=$?
  fi
  return "${qa_status}"
}

# ── dispatch ──────────────────────────────────────────────────────────────────

command="${1:-help}"
[[ $# -gt 0 ]] && shift

case "${command}" in
  build)
    cmd_build "$@"
    ;;
  push)
    cmd_push "$@"
    ;;
  release)
    warn "The release command is deprecated; use './service.sh build' and then './service.sh push'"
    cmd_build "$@"
    ;;
  dev)
    cmd_dev "$@"
    ;;
  deploy)
    cmd_deploy "$@"
    ;;
  qa)
    cmd_qa "$@"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    fail "Unknown command: ${command}. Run './service.sh --help'."
    ;;
esac

#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

log() {
  printf '[service] %s\n' "$*"
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
  release [options]   Bump version, generate release notes, build + push Docker images
  dev [options]       Run the local disposable Docker Swarm dev environment
  deploy              Build the app image locally and deploy the swarm stack
  help                Show this help

Run './service.sh <command> --help' for command-specific options.

Examples:
  ./service.sh release --no-bump
  ./service.sh dev --full
  ./service.sh dev --reset
  ./service.sh deploy
EOF
}

# ── release: bump version, write release notes, build + push images ─────────

usage_release() {
  cat <<'EOF'
Usage: ./service.sh release [options]

Build and publish KNetraHub to the local Docker registry.

Default behavior:
  - bump package version by patch
  - generate release notes
  - build the app and agent Docker images
  - push registry.kdsb.com.kh/knetrahub/app:<version> and :latest
  - push registry.kdsb.com.kh/knetrahub/agent:<version> and :latest

Options:
  --patch                 Bump patch version (default)
  --minor                 Bump minor version
  --major                 Bump major version
  --bump patch|minor|major
  --version x.y.z         Set an exact version
  --no-bump               Keep the current package version for test publishes
  --no-push               Build and tag locally without pushing
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
  ./service.sh release
  ./service.sh release --minor
  ./service.sh release --version 1.2.0
  ./service.sh release --no-bump
  ./service.sh release --no-bump --no-push
  ./service.sh release --tag-prefix v
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

cmd_release() {
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

  local BUMP="patch"
  local CUSTOM_VERSION=""
  local NO_BUMP="false"
  local PUSH="true"

  while [[ $# -gt 0 ]]; do
    case "$1" in
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
        PUSH="false"
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
        usage_release
        return 0
        ;;
      *)
        fail "Unknown release option: $1"
        ;;
    esac
    shift
  done

  case "${BUMP}" in
    patch|minor|major) ;;
    *) fail "--bump must be patch, minor, or major" ;;
  esac

  local NODE_BIN DOCKER_BIN GIT_BIN
  NODE_BIN="$(resolve_command node)" || fail "Missing required command: node"
  DOCKER_BIN="$(resolve_command docker)" || fail "Missing required command: docker"
  GIT_BIN="$(resolve_command git)" || fail "Missing required command: git"

  local current_version
  current_version="$("${NODE_BIN}" -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"

  if [[ -n "${CUSTOM_VERSION}" && "${NO_BUMP}" == "true" ]]; then
    fail "Use either --version or --no-bump, not both"
  fi

  local next_version
  if [[ "${NO_BUMP}" == "true" ]]; then
    next_version="${current_version}"
    log "Keeping current version ${next_version}"
  elif [[ -n "${CUSTOM_VERSION}" ]]; then
    validate_version "${CUSTOM_VERSION}"
    next_version="${CUSTOM_VERSION}"
    log "Setting exact version ${next_version}"
    write_version "${next_version}"
  else
    next_version="$(bump_version "${current_version}" "${BUMP}")"
    log "Bumping version ${current_version} -> ${next_version}"
    write_version "${next_version}"
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

  if [[ "${PUSH}" == "true" ]]; then
    log "Pushing ${version_image}"
    "${DOCKER_BIN}" push "${version_image}"
    log "Pushing ${latest_image}"
    "${DOCKER_BIN}" push "${latest_image}"
    log "Pushing ${agent_version_image}"
    "${DOCKER_BIN}" push "${agent_version_image}"
    log "Pushing ${agent_latest_image}"
    "${DOCKER_BIN}" push "${agent_latest_image}"
  else
    log "Skipping docker push because --no-push was provided"
  fi

  log "Release ready: ${version_image} + ${agent_version_image}"
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

For a versioned, registry-published release use './service.sh release' instead.
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

# ── dispatch ──────────────────────────────────────────────────────────────────

command="${1:-help}"
[[ $# -gt 0 ]] && shift

case "${command}" in
  release)
    cmd_release "$@"
    ;;
  dev)
    cmd_dev "$@"
    ;;
  deploy)
    cmd_deploy "$@"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    fail "Unknown command: ${command}. Run './service.sh --help'."
    ;;
esac

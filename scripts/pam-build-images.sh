#!/usr/bin/env bash
# Build & push the PAM sidecar images. `docker stack deploy` ignores `build:`,
# so images MUST be built and pushed before deploying docker-compose.pam.yml.
#
# Usage:
#   bash scripts/pam-build-images.sh <registry-prefix> [tag]
# Example:
#   bash scripts/pam-build-images.sh registry.kdsb.com.kh/knetrahub latest
#
# Builds:
#   <prefix>/pam-ssh-gateway:<tag>       (services/pam/ssh-gateway)
#   <prefix>/pam-connector-runner:<tag>  (services/pam/connector-runner)
# The main portal image (used by pam-worker) is built by the main pipeline.
set -euo pipefail

PREFIX="${1:?usage: pam-build-images.sh <registry-prefix> [tag]}"
TAG="${2:-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUSH="${PUSH:-1}"

build() {
  local name="$1" ctx="$2"
  local image="${PREFIX}/${name}:${TAG}"
  echo "==> building ${image} (context ${ctx})"
  docker build -t "${image}" "${ctx}"
  if [ "${PUSH}" = "1" ]; then
    echo "==> pushing ${image}"
    docker push "${image}"
  else
    echo "==> PUSH=0, skipping push of ${image}"
  fi
}

# Compute fresh connector-bundle digests before building the runner image so the
# baked manifest matches the bundles the control plane will register.
echo "==> publishing connector manifest"
node "${ROOT}/scripts/pam-publish-connectors.mjs"

build "pam-ssh-gateway"      "${ROOT}/services/pam/ssh-gateway"
build "pam-connector-runner" "${ROOT}/services/pam/connector-runner"

echo "Done. Images built${PUSH:+ and pushed} with tag '${TAG}'."
echo "Deploy with: docker stack deploy -c docker/docker-compose.yml -c docker/docker-compose.pam.yml knetrahub"

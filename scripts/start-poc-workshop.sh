#!/usr/bin/env bash
set -euo pipefail

IMAGE_APP_ROOT="${IMAGE_APP_ROOT:-/app}"
VOLUME_ROOT="${AI_DAW_VOLUME_ROOT:-/data}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-${VOLUME_ROOT}/ai-daw-tools}"
HOST="${HOST:-0.0.0.0}"
APP_PORT="${PORT:-3000}"

log() {
  printf '[ai-daw-fly-poc] %s\n' "$*"
}

case "$WORKSPACE_ROOT" in
  "" | "/" | "/app" | "$IMAGE_APP_ROOT")
    echo "Refusing unsafe WORKSPACE_ROOT: ${WORKSPACE_ROOT}" >&2
    exit 1
    ;;
esac

mkdir -p "$WORKSPACE_ROOT"

if [[ "${AI_DAW_RESET_WORKSPACE:-0}" == "1" ]]; then
  log "resetting writable workspace at ${WORKSPACE_ROOT}"
  find "$WORKSPACE_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

if [[ ! -f "${WORKSPACE_ROOT}/package.json" ]]; then
  log "seeding writable workspace from ${IMAGE_APP_ROOT}"
  rsync -a \
    --include='.env.example' \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='coverage' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='*.tsbuildinfo' \
    --exclude='next-env.d.ts' \
    "${IMAGE_APP_ROOT}/" \
    "${WORKSPACE_ROOT}/"
else
  log "using existing writable workspace at ${WORKSPACE_ROOT}"
fi

cd "$WORKSPACE_ROOT"

log "installing dependencies in writable workspace"
pnpm install --frozen-lockfile

log "starting Next dev server on ${HOST}:${APP_PORT}"
exec pnpm dev --hostname "$HOST" --port "$APP_PORT"

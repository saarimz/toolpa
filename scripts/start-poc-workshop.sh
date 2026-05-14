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

log "syncing image source into writable workspace"
rsync -a \
  --include='.env.example' \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='coverage' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.audit' \
  --exclude='*.tsbuildinfo' \
  --exclude='next-env.d.ts' \
  "${IMAGE_APP_ROOT}/" \
  "${WORKSPACE_ROOT}/"

cd "$WORKSPACE_ROOT"
rm -rf "${WORKSPACE_ROOT}/.next"

if [[ -L "${WORKSPACE_ROOT}/node_modules" ]]; then
  log "removing external node_modules symlink"
  rm -rf "${WORKSPACE_ROOT}/node_modules"
fi

log "materializing dependencies in writable workspace"
CI=true pnpm install --frozen-lockfile --prefer-offline

log "starting Next dev server on ${HOST}:${APP_PORT}"
exec pnpm dev --hostname "$HOST" --port "$APP_PORT"

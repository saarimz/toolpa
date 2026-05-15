#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${FLY_APP_NAME:-toolpa-js-poc}"
REGION="${FLY_REGION:-iad}"
VOLUME_NAME="${FLY_VOLUME_NAME:-toolpa_js_data}"
VOLUME_SIZE="${FLY_VOLUME_SIZE:-20}"
CONFIG_PATH="${FLY_CONFIG_PATH:-fly.toml}"
MODEL="${AI_GATEWAY_MODEL:-deepseek/deepseek-v4-flash}"

log() {
  printf '[fly-poc] %s\n' "$*"
}

require_flyctl() {
  if ! command -v fly >/dev/null 2>&1; then
    cat >&2 <<'MSG'
flyctl is not installed.

Install it first:
  brew install flyctl

Then authenticate:
  fly auth login
MSG
    exit 1
  fi
}

read_env_value() {
  local key="$1"
  local file="${2:-.env.local}"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2-
}

read_gateway_key_from_env_files() {
  local file
  local value
  for file in .env.developme .env.development .env.local; do
    value="$(read_env_value AI_GATEWAY_API_KEY "$file" || true)"
    if [[ -n "$value" ]]; then
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"
      printf '%s\n' "$value"
      log "read AI_GATEWAY_API_KEY from ${file}" >&2
      return 0
    fi
  done
  return 1
}

require_flyctl

if ! fly auth whoami >/dev/null 2>&1; then
  cat >&2 <<'MSG'
flyctl is installed but not authenticated.

Run:
  fly auth login
MSG
  exit 1
fi

if ! fly status --app "$APP_NAME" >/dev/null 2>&1; then
  log "creating Fly app ${APP_NAME}"
  fly apps create "$APP_NAME"
else
  log "using existing Fly app ${APP_NAME}"
fi

if ! fly volumes list --app "$APP_NAME" | grep -q "$VOLUME_NAME"; then
  log "creating ${VOLUME_SIZE}GB volume ${VOLUME_NAME} in ${REGION}"
  fly volumes create "$VOLUME_NAME" \
    --app "$APP_NAME" \
    --region "$REGION" \
    --size "$VOLUME_SIZE" \
    --yes
else
  log "using existing volume ${VOLUME_NAME}"
fi

GATEWAY_KEY="${AI_GATEWAY_API_KEY:-}"
if [[ -z "$GATEWAY_KEY" ]]; then
  GATEWAY_KEY="$(read_gateway_key_from_env_files || true)"
fi

if [[ -n "$GATEWAY_KEY" ]]; then
  log "setting AI Gateway secrets"
  fly secrets set \
    "AI_GATEWAY_API_KEY=${GATEWAY_KEY}" \
    "AI_GATEWAY_MODEL=${MODEL}" \
    --app "$APP_NAME"
else
  log "AI_GATEWAY_API_KEY not found; deploying without AI generation enabled"
fi

log "deploying ${APP_NAME} with ${CONFIG_PATH}"
fly deploy \
  --app "$APP_NAME" \
  --config "$CONFIG_PATH" \
  --smoke-checks=false \
  --wait-timeout 10m

log "ensuring a single Machine for the writable-volume POC"
fly scale count 1 --app "$APP_NAME" --yes

log "deployment complete"
log "open with: fly open --app ${APP_NAME}"

#!/usr/bin/env zsh
##
export PS4='> '
setopt LOCAL_OPTIONS PIPE_FAIL PRINT_EXIT_VALUE ERR_RETURN SOURCE_TRACE XTRACE
setopt TYPESET_SILENT NO_CASE_GLOB multios re_match_pcre extendedglob pipefail interactivecomments hash_executables_only

nvm-load || true  #: lazy-loading nvm (specific to my setup, ignore)
nvm use 16

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

USE_HTTPS="false"
for arg in "$@"; do
  case "$arg" in
    --https) USE_HTTPS="true" ;;
    *)
      echo "Unknown arg: $arg" >&2
      echo "Usage: ./run.zsh [--https]" >&2
      exit 1
      ;;
  esac
done

if [[ -f .env.local ]]; then
  set -a
  source ./.env.local
  set +a
else
  echo "Missing .env.local. Run ./prepare_once.zsh first or create .env.local." >&2
  exit 1
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not found. Install it or rerun ./prepare_once.zsh after fixing apt." >&2
  exit 1
fi

if [[ ! -f web/server/dist/server_web.js || ! -f web/server/dist/server_bgio.js || ! -f web/.next/BUILD_ID || ! -f fbg-server/dist/main.js ]]; then
  echo "Build artifacts missing. Run ./prepare_once.zsh (or rebuild) first." >&2
  exit 1
fi

tmuxnew () {
  tmux kill-session -t "$1" &> /dev/null || true
  tmux new -d -s "$@"
}

WEB_CMD="cd $ROOT_DIR/web; nvm-load || true; nvm use 16; NODE_ENV=${NODE_ENV:-production} CHANNEL=${CHANNEL:-production} SERVER_PORT=${SERVER_PORT:-3000} FBG_BACKEND_TARGET=${FBG_BACKEND_TARGET:-http://127.0.0.1:3001} node server/dist/server_web.js"

PUBLIC_HOST_FALLBACK="fbg.lilf.ir"
PUBLIC_HOST_EFFECTIVE="${PUBLIC_HOST:-$PUBLIC_HOST_FALLBACK}"
PUBLIC_SCHEME="http"
if [[ "$USE_HTTPS" == "true" ]]; then
  PUBLIC_SCHEME="https"
fi
PUBLIC_URL_EFFECTIVE="${PUBLIC_SCHEME}://${PUBLIC_HOST_EFFECTIVE}"
BGIO_PUBLIC_DEFAULT="${BGIO_PUBLIC_SERVERS:-${PUBLIC_URL_EFFECTIVE}}"

BGIO_CMD="cd $ROOT_DIR/web; nvm-load || true; nvm use 16; BGIO_PORT=${BGIO_PORT:-8001} BGIO_PUBLIC_SERVERS=${BGIO_PUBLIC_DEFAULT} BGIO_PRIVATE_SERVERS=${BGIO_PRIVATE_SERVERS:-http://127.0.0.1:8001} node server/dist/server_bgio.js"

BACKEND_NODE_ENV="${NODE_ENV:-production}"
if [[ -z "${FBG_REDIS_HOST:-}" || -z "${FBG_REDIS_PORT:-}" ]]; then
  BACKEND_NODE_ENV="development"
  echo "FBG_REDIS_HOST/FBG_REDIS_PORT not set; running backend with NODE_ENV=development (in-memory pubsub)." >&2
fi
REDIS_HOST="${FBG_REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${FBG_REDIS_PORT:-6379}"
REDIS_PASSWORD="${FBG_REDIS_PASSWORD:-}"
BACKEND_CMD="cd $ROOT_DIR/fbg-server; nvm-load || true; nvm use 16; NODE_ENV=${BACKEND_NODE_ENV} FORCE_DB_SYNC=${FORCE_DB_SYNC:-true} JWT_SECRET=${JWT_SECRET:-unsafe} BGIO_PRIVATE_SERVERS=${BGIO_PRIVATE_SERVERS:-http://127.0.0.1:8001} BGIO_PUBLIC_SERVERS=${BGIO_PUBLIC_DEFAULT} FBG_REDIS_HOST=${REDIS_HOST} FBG_REDIS_PORT=${REDIS_PORT} FBG_REDIS_PASSWORD=${REDIS_PASSWORD} node dist/main.js"

CADDY_CONFIG="$ROOT_DIR/caddy_config_http"
if [[ "$USE_HTTPS" == "true" ]]; then
  CADDY_CONFIG="$ROOT_DIR/caddy_config"
fi
CADDY_CMD="cd $ROOT_DIR; caddy run --config $CADDY_CONFIG --adapter caddyfile"

# Start services in tmux sessions.
SESSIONS=()
if command -v caddy >/dev/null 2>&1 && [[ -f "$CADDY_CONFIG" ]]; then
  if [[ "${CADDY_USE_SUDO:-false}" == "true" ]]; then
    tmuxnew fbg-caddy sudo -E zsh -c "$CADDY_CMD"
  else
    tmuxnew fbg-caddy zsh -c "$CADDY_CMD"
  fi
  SESSIONS+=(fbg-caddy)
else
  echo "Caddy not found or config missing ($CADDY_CONFIG); skipping reverse proxy." >&2
fi
tmuxnew fbg-web zsh -c "$WEB_CMD"
tmuxnew fbg-bgio zsh -c "$BGIO_CMD"
tmuxnew fbg-backend zsh -c "$BACKEND_CMD"
SESSIONS+=(fbg-web fbg-bgio fbg-backend)

echo "Started tmux sessions: ${SESSIONS[*]}"

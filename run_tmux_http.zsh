#!/usr/bin/env zsh

setopt ERR_EXIT PIPE_FAIL NO_UNSET

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

NODE_VERSION="${NODE_VERSION:-$(<"$ROOT_DIR/.nvmrc")}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.http.local}"
DEFAULT_PUBLIC_HOST="${DEFAULT_PUBLIC_HOST:-pinky.lilf.ir:3000}"
DEFAULT_CADDY_HOST="${DEFAULT_CADDY_HOST:-fbg.pinky.lilf.ir}"
DEFAULT_CODENAMES_PICTURES_DIR="${DEFAULT_CODENAMES_PICTURES_DIR:-~/Pictures/SurrealPictures/chosen_1}"
CADDYFILE_PATH="${CADDYFILE_PATH:-$HOME/Caddyfile}"
CADDY_BLOCK_BEGIN="# BEGIN freeboardgames http self-host"
CADDY_BLOCK_END="# END freeboardgames http self-host"

SESSION_WEB="fbg-http-web"
SESSION_BGIO="fbg-http-bgio"
SESSION_BACKEND="fbg-http-backend"

tmuxnew () {
	tmux kill-session -t "$1" &> /dev/null || true
	tmux new -d -s "$@"
}

say() {
  print -r -- "$@"
}

die() {
  print -u2 -r -- "$@"
  exit 1
}

use_proxy() {
  export ALL_PROXY=http://127.0.0.1:1087 all_proxy=http://127.0.0.1:1087 http_proxy=http://127.0.0.1:1087 https_proxy=http://127.0.0.1:1087 HTTP_PROXY=http://127.0.0.1:1087 HTTPS_PROXY=http://127.0.0.1:1087
  export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
}

load_node() {
  nvm-load
  nvm use "$NODE_VERSION"
}

normalize_host() {
  local host="${1:-$DEFAULT_PUBLIC_HOST}"
  host="${host#http://}"
  host="${host#https://}"
  host="${host%%/*}"
  print -r -- "$host"
}

generate_jwt_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    print -r -- "replace-this-with-a-random-secret"
  fi
}

init_env_file() {
  local host
  host="$(normalize_host "${1:-$DEFAULT_PUBLIC_HOST}")"
  local jwt_secret
  jwt_secret="$(generate_jwt_secret)"

  if [[ -f "$ENV_FILE" && "${FORCE_ENV_INIT:-false}" != "true" ]]; then
    die "$ENV_FILE already exists. Remove it first or rerun with FORCE_ENV_INIT=true."
  fi

  cat > "$ENV_FILE" <<EOF
PUBLIC_HOST=$host
PUBLIC_URL=http://$host
SERVER_PORT=3000
BGIO_PORT=8001
FBG_BACKEND_TARGET=http://127.0.0.1:3001
BGIO_PRIVATE_SERVERS=http://127.0.0.1:8001
BGIO_PUBLIC_SERVERS=http://$host
CHANNEL=production
FORCE_DB_SYNC=true
JWT_SECRET=$jwt_secret
WEB_NODE_ENV=production
BACKEND_NODE_ENV=development
CODENAMES_PICTURES_DIR=$DEFAULT_CODENAMES_PICTURES_DIR
EOF

  say "Wrote $ENV_FILE"
}

load_repo_env() {
  [[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE. Run ./run_tmux_http.zsh env-init [host:port] first."

  set -a
  source "$ENV_FILE"
  set +a

  export PUBLIC_HOST="${PUBLIC_HOST:-$DEFAULT_PUBLIC_HOST}"
  export PUBLIC_URL="${PUBLIC_URL:-http://${PUBLIC_HOST}}"
  export SERVER_PORT="${SERVER_PORT:-3000}"
  export BGIO_PORT="${BGIO_PORT:-8001}"
  export FBG_BACKEND_TARGET="${FBG_BACKEND_TARGET:-http://127.0.0.1:3001}"
  export BGIO_PRIVATE_SERVERS="${BGIO_PRIVATE_SERVERS:-http://127.0.0.1:8001}"
  export BGIO_PUBLIC_SERVERS="${BGIO_PUBLIC_SERVERS:-${PUBLIC_URL}}"
  export CHANNEL="${CHANNEL:-production}"
  export FORCE_DB_SYNC="${FORCE_DB_SYNC:-true}"
  export JWT_SECRET="${JWT_SECRET:-unsafe-change-me}"
  export WEB_NODE_ENV="${WEB_NODE_ENV:-production}"
  export BACKEND_NODE_ENV="${BACKEND_NODE_ENV:-development}"
  export CODENAMES_PICTURES_DIR="${CODENAMES_PICTURES_DIR:-$DEFAULT_CODENAMES_PICTURES_DIR}"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  python3 - "$file" "$key" "$value" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1]).expanduser()
key = sys.argv[2]
value = sys.argv[3]

try:
    text = path.read_text()
except FileNotFoundError:
    text = ""

lines = text.splitlines()
updated = []
replaced = False

for line in lines:
    if line.startswith(f"{key}="):
        updated.append(f"{key}={value}")
        replaced = True
    else:
        updated.append(line)

if not replaced:
    updated.append(f"{key}={value}")

path.write_text("\n".join(updated) + "\n")
PY
}

sync_caddy_env() {
  local host="$1"
  [[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE. Run ./run_tmux_http.zsh env-init first."

  set_env_value "$ENV_FILE" "PUBLIC_HOST" "$host"
  set_env_value "$ENV_FILE" "PUBLIC_URL" "http://$host"
  set_env_value "$ENV_FILE" "BGIO_PUBLIC_SERVERS" "http://$host"

  say "Updated $ENV_FILE for http://$host"
}

write_caddy_block() {
  local host="$1"

  python3 - "$CADDYFILE_PATH" "$host" "$CADDY_BLOCK_BEGIN" "$CADDY_BLOCK_END" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1]).expanduser()
host = sys.argv[2]
start = sys.argv[3]
end = sys.argv[4]

block = f"""{start}
http://{host} {{
\tencode zstd gzip

\t@graphql {{
\t\tpath /graphql*
\t}}
\t@bgio {{
\t\tpath /socket.io* /games/*
\t}}
\treverse_proxy @graphql 127.0.0.1:3001
\treverse_proxy @bgio 127.0.0.1:8001
\treverse_proxy 127.0.0.1:3000
}}
{end}
"""

path.parent.mkdir(parents=True, exist_ok=True)
try:
    text = path.read_text()
except FileNotFoundError:
    text = ""

if start in text and end in text:
    start_idx = text.index(start)
    end_idx = text.index(end, start_idx) + len(end)
    new_text = text[:start_idx] + block + text[end_idx:]
else:
    trimmed = text.rstrip()
    if trimmed:
        new_text = trimmed + "\n\n" + block
    else:
        new_text = block

if not new_text.endswith("\n"):
    new_text += "\n"

path.write_text(new_text)
PY

  say "Updated $CADDYFILE_PATH for http://$host"
}

reload_or_start_caddy() {
  command -v caddy >/dev/null 2>&1 || die "caddy is not installed."

  caddy validate --config "$CADDYFILE_PATH" --adapter caddyfile >/dev/null || die "Caddy validation failed for $CADDYFILE_PATH"

  if caddy reload --config "$CADDYFILE_PATH" --adapter caddyfile >/dev/null 2>&1; then
    say "Reloaded Caddy from $CADDYFILE_PATH"
    return
  fi

  if pgrep -x caddy >/dev/null 2>&1; then
    die "Caddy appears to be running, but reload failed. Try: caddy reload --config $CADDYFILE_PATH --adapter caddyfile"
  fi

  local caddy_log="${CADDY_LOG_PATH:-$HOME/.caddy-fbg.log}"
  caddy run --config "$CADDYFILE_PATH" --adapter caddyfile >"$caddy_log" 2>&1 < /dev/null &!
  say "Started Caddy with $CADDYFILE_PATH (log: $caddy_log)"
}

restart_app_if_running() {
  if ! command -v tmux >/dev/null 2>&1; then
    say "tmux is not installed; skipped app restart."
    return
  fi

  local session
  for session in "$SESSION_WEB" "$SESSION_BGIO" "$SESSION_BACKEND"; do
    if tmux has-session -t "$session" 2>/dev/null; then
      say "Restarting tmux sessions to apply the updated public host."
      stop_sessions
      start_sessions
      return
    fi
  done

  say "No app tmux sessions were running. Run ./run_tmux_http.zsh start when ready."
}

enable_caddy() {
  local host
  host="$(normalize_host "${1:-$DEFAULT_CADDY_HOST}")"

  sync_caddy_env "$host"
  write_caddy_block "$host"
  reload_or_start_caddy
  restart_app_if_running
}

ensure_tmux() {
  command -v tmux >/dev/null 2>&1 || die "tmux is not installed."
}

ensure_build_artifacts() {
  [[ -f "$ROOT_DIR/web/server/dist/server_web.js" ]] || die "Missing web/server/dist/server_web.js. Run ./run_tmux_http.zsh install first."
  [[ -f "$ROOT_DIR/web/server/dist/server_bgio.js" ]] || die "Missing web/server/dist/server_bgio.js. Run ./run_tmux_http.zsh install first."
  [[ -f "$ROOT_DIR/web/.next/BUILD_ID" ]] || die "Missing web/.next/BUILD_ID. Run ./run_tmux_http.zsh install first."
  [[ -f "$ROOT_DIR/fbg-server/dist/main.js" ]] || die "Missing fbg-server/dist/main.js. Run ./run_tmux_http.zsh install first."
}

rebuild_node_bins() {
  python3 - "$ROOT_DIR" <<'PY'
import json
import os
import pathlib
import sys

roots = [pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[1]) / 'web', pathlib.Path(sys.argv[1]) / 'fbg-server']
for root in roots:
    node_modules = root / 'node_modules'
    if not node_modules.is_dir():
        continue
    bin_dir = node_modules / '.bin'
    bin_dir.mkdir(exist_ok=True)
    packages = []
    for child in node_modules.iterdir():
        if child.name == '.bin':
            continue
        if child.name.startswith('@') and child.is_dir():
            packages.extend([pkg for pkg in child.iterdir() if pkg.is_dir()])
        elif child.is_dir():
            packages.append(child)
    for pkg in packages:
        package_json = pkg / 'package.json'
        if not package_json.exists():
            continue
        try:
            package = json.loads(package_json.read_text())
        except Exception:
            continue
        package_bins = package.get('bin')
        if not package_bins:
            continue
        if isinstance(package_bins, str):
            package_bins = {package['name'].split('/')[-1]: package_bins}
        for name, relpath in package_bins.items():
            target = pkg / relpath
            link = bin_dir / name
            try:
                if link.exists() or link.is_symlink():
                    link.unlink()
                os.symlink(os.path.relpath(target, bin_dir), link)
            except FileNotFoundError:
                continue
PY
}

install_local() {
  use_proxy
  load_node

  if [[ "${FORCE_INSTALL:-false}" == "true" || ! -d "$ROOT_DIR/node_modules" || ! -d "$ROOT_DIR/web/node_modules" || ! -d "$ROOT_DIR/fbg-server/node_modules" ]]; then
    yarn install --ignore-scripts
    (cd web && yarn install --ignore-scripts)
    (cd fbg-server && yarn install --ignore-scripts)
  else
    say "Dependencies already present; skipping yarn install (set FORCE_INSTALL=true to reinstall)."
  fi

  rebuild_node_bins
  yarn run codegen
  (cd web && yarn run i18n:copy)
  yarn run build
  (yarn --cwd fbg-server run build)

  say "Install/build complete."
}

tmux_env_exports() {
  cat <<EOF
export ALL_PROXY=http://127.0.0.1:1087 all_proxy=http://127.0.0.1:1087 http_proxy=http://127.0.0.1:1087 https_proxy=http://127.0.0.1:1087 HTTP_PROXY=http://127.0.0.1:1087 HTTPS_PROXY=http://127.0.0.1:1087;
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost;
export CODENAMES_PICTURES_DIR=${(q)CODENAMES_PICTURES_DIR};
EOF
}

start_sessions() {
  ensure_tmux
  load_repo_env
  ensure_build_artifacts

  local PROXY_EXPORTS
  PROXY_EXPORTS="$(tmux_env_exports)"

  local WEB_CMD
  WEB_CMD="${PROXY_EXPORTS} cd ${(q)ROOT_DIR}/web; nvm-load; nvm use ${(q)NODE_VERSION}; NODE_ENV=${(q)WEB_NODE_ENV} CHANNEL=${(q)CHANNEL} SERVER_PORT=${(q)SERVER_PORT} FBG_BACKEND_TARGET=${(q)FBG_BACKEND_TARGET} BGIO_PRIVATE_SERVERS=${(q)BGIO_PRIVATE_SERVERS} node server/dist/server_web.js"

  local BGIO_CMD
  BGIO_CMD="${PROXY_EXPORTS} cd ${(q)ROOT_DIR}/web; nvm-load; nvm use ${(q)NODE_VERSION}; BGIO_PORT=${(q)BGIO_PORT} BGIO_PUBLIC_SERVERS=${(q)BGIO_PUBLIC_SERVERS} BGIO_PRIVATE_SERVERS=${(q)BGIO_PRIVATE_SERVERS} node server/dist/server_bgio.js"

  local BACKEND_CMD
  BACKEND_CMD="${PROXY_EXPORTS} cd ${(q)ROOT_DIR}/fbg-server; nvm-load; nvm use ${(q)NODE_VERSION}; NODE_ENV=${(q)BACKEND_NODE_ENV} FORCE_DB_SYNC=${(q)FORCE_DB_SYNC} JWT_SECRET=${(q)JWT_SECRET} BGIO_PRIVATE_SERVERS=${(q)BGIO_PRIVATE_SERVERS} BGIO_PUBLIC_SERVERS=${(q)BGIO_PUBLIC_SERVERS} node dist/main.js"

  tmuxnew "$SESSION_WEB" zsh -lc "$WEB_CMD"
  tmuxnew "$SESSION_BGIO" zsh -lc "$BGIO_CMD"
  tmuxnew "$SESSION_BACKEND" zsh -lc "$BACKEND_CMD"

  say "Started:"
  say "  $SESSION_WEB"
  say "  $SESSION_BGIO"
  say "  $SESSION_BACKEND"
}

stop_sessions() {
  local session
  for session in "$SESSION_WEB" "$SESSION_BGIO" "$SESSION_BACKEND"; do
    tmux kill-session -t "$session" &> /dev/null || true
  done
  say "Stopped tmux sessions."
}

status_sessions() {
  ensure_tmux
  local session
  for session in "$SESSION_WEB" "$SESSION_BGIO" "$SESSION_BACKEND"; do
    if tmux has-session -t "$session" 2>/dev/null; then
      say "$session: running"
    else
      say "$session: stopped"
    fi
  done
}

resolve_session() {
  case "${1:-}" in
    web) print -r -- "$SESSION_WEB" ;;
    bgio) print -r -- "$SESSION_BGIO" ;;
    backend) print -r -- "$SESSION_BACKEND" ;;
    *)
      die "Usage: ./run_tmux_http.zsh attach <web|bgio|backend>"
      ;;
  esac
}

attach_session() {
  ensure_tmux
  local session
  session="$(resolve_session "${1:-}")"
  exec tmux attach -t "$session"
}

show_logs() {
  ensure_tmux
  local session
  session="$(resolve_session "${1:-}")"
  tmux capture-pane -pt "$session" -S -200
}

main() {
  case "${1:-start}" in
    env-init)
      init_env_file "${2:-$DEFAULT_PUBLIC_HOST}"
      ;;
    install)
      install_local
      ;;
    start)
      start_sessions
      ;;
    stop)
      stop_sessions
      ;;
    restart)
      stop_sessions
      start_sessions
      ;;
    enable-caddy)
      enable_caddy "${2:-$DEFAULT_CADDY_HOST}"
      ;;
    status)
      status_sessions
      ;;
    attach)
      attach_session "${2:-}"
      ;;
    logs)
      show_logs "${2:-}"
      ;;
    *)
      die "Usage: ./run_tmux_http.zsh [env-init [host:port]|install|start|stop|restart|enable-caddy [host]|status|attach <web|bgio|backend>|logs <web|bgio|backend>]"
      ;;
  esac
}

main "$@"

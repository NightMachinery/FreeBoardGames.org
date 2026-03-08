#!/usr/bin/env zsh

setopt ERR_EXIT PIPE_FAIL NO_UNSET

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

NODE_VERSION="${NODE_VERSION:-$(<"$ROOT_DIR/.nvmrc")}"

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

load_repo_env() {
  if [[ -f "$ROOT_DIR/.env.local" ]]; then
    set -a
    source "$ROOT_DIR/.env.local"
    set +a
  fi

  export PUBLIC_HOST="${PUBLIC_HOST:-pinky.lilf.ir:3000}"
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
  cat <<'EOF'
export ALL_PROXY=http://127.0.0.1:1087 all_proxy=http://127.0.0.1:1087 http_proxy=http://127.0.0.1:1087 https_proxy=http://127.0.0.1:1087 HTTP_PROXY=http://127.0.0.1:1087 HTTPS_PROXY=http://127.0.0.1:1087;
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost;
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
      die "Usage: ./run_tmux_http.zsh [install|start|stop|restart|status|attach <web|bgio|backend>|logs <web|bgio|backend>]"
      ;;
  esac
}

main "$@"

#!/usr/bin/env zsh
emulate -L zsh -o errexit -o nounset -o pipefail

readonly ROOT_DIR="${0:A:h}"
readonly STATE_DIR="$ROOT_DIR/.self_host"
readonly CONFIG_FILE="$STATE_DIR/config.env"
readonly LOG_DIR="$STATE_DIR/logs"
readonly CADDYFILE="${SELF_HOST_CADDYFILE:-$HOME/Caddyfile}"
readonly DEFAULT_PUBLIC_URL="${SELF_HOST_PUBLIC_URL:-http://fbg.pinky.lilf.ir}"
readonly NODE_VERSION="${SELF_HOST_NODE_VERSION:-$(<"$ROOT_DIR/.nvmrc")}"
readonly PNPM_VERSION="${SELF_HOST_PNPM_VERSION:-10.33.2}"
readonly PNPM_MAJOR="${PNPM_VERSION%%.*}"
readonly DEFAULT_WEB_PORT="${SELF_HOST_WEB_PORT:-3000}"
readonly DEFAULT_BGIO_PORT="${SELF_HOST_BGIO_PORT:-8001}"
readonly DEFAULT_BACKEND_PORT="${SELF_HOST_BACKEND_PORT:-3001}"
readonly BACKEND_NODE_ENV_DEFAULT="${SELF_HOST_BACKEND_NODE_ENV:-development}"
readonly CODENAMES_PICTURES_DIR_DEFAULT="${DEFAULT_CODENAMES_PICTURES_DIR:-$HOME/Pictures/SurrealPictures/chosen_2}"
readonly FBG_IMAGES_CACHE_DIR_DEFAULT="${DEFAULT_FBG_IMAGES_CACHE_DIR:-$HOME/.cache/talespin/cards}"
readonly PROD_WEB_SESSION='fbg-selfhost-web'
readonly PROD_BGIO_SESSION='fbg-selfhost-bgio'
readonly PROD_BACKEND_SESSION='fbg-selfhost-backend'
readonly DEV_WEB_SESSION='fbg-selfhost-web-dev'
readonly DEV_BGIO_SESSION='fbg-selfhost-bgio-dev'
readonly DEV_BACKEND_SESSION='fbg-selfhost-backend-dev'
readonly CADDY_BEGIN='# BEGIN freeboardgames self-host'
readonly CADDY_END='# END freeboardgames self-host'
readonly DEFAULT_DEPLOY_GAMES=(secretcodes)

PUBLIC_URL=''
SITE_ADDRESS=''
PUBLIC_HOSTPORT=''
SELECTED_PUBLIC_URL=''
SELECTED_GAMES=()

usage() {
  cat <<USAGE
Usage:
  ./self_host.zsh setup [public_url] [game ...]
  ./self_host.zsh redeploy [public_url] [game ...]
  ./self_host.zsh start [public_url]
  ./self_host.zsh dev-start [public_url]
  ./self_host.zsh stop

Default public_url: $DEFAULT_PUBLIC_URL
Default setup/redeploy games: ${DEFAULT_DEPLOY_GAMES[*]}

public_url may be a full http(s) origin or a host-only value. Paths, query strings, and fragments are not supported.
setup/redeploy game arguments are web/src/games directory names. The alias 'secretnames' maps to 'secretcodes'.
USAGE
}

die() {
  print -u2 -- "Error: $*"
  exit 1
}

note() {
  print -- "==> $*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_dirs() {
  mkdir -p "$STATE_DIR" "$LOG_DIR"
}

normalize_public_url() {
  local input="${1:-$DEFAULT_PUBLIC_URL}"
  python3 - "$input" <<'PY'
import sys
from urllib.parse import urlparse
raw = sys.argv[1].strip().rstrip('/')
if not raw:
    raise SystemExit('public_url must not be empty')
if '://' not in raw:
    raw = 'http://' + raw
parsed = urlparse(raw)
if parsed.scheme not in {'http', 'https'}:
    raise SystemExit('public_url must begin with http:// or https://')
if not parsed.netloc:
    raise SystemExit('public_url must include a hostname')
if parsed.path not in ('', '/'):
    raise SystemExit('public_url must not include a path')
if parsed.params or parsed.query or parsed.fragment:
    raise SystemExit('public_url must not include params, query, or fragment')
print(f'{parsed.scheme}://{parsed.netloc}')
PY
}

parse_public_url() {
  local url="$1"
  local parsed
  parsed="$(python3 - "$url" <<'PY'
import shlex
import sys
from urllib.parse import urlparse
parsed = urlparse(sys.argv[1])
site_address = parsed.netloc if parsed.scheme == 'https' else f'http://{parsed.netloc}'
print(f"PUBLIC_URL={shlex.quote(sys.argv[1])}")
print(f"SITE_ADDRESS={shlex.quote(site_address)}")
print(f"PUBLIC_HOSTPORT={shlex.quote(parsed.netloc)}")
PY
)"
  eval "$parsed"
}

write_config() {
  local url="$1"
  local saved_web_port="$DEFAULT_WEB_PORT"
  local saved_bgio_port="$DEFAULT_BGIO_PORT"
  local saved_backend_port="$DEFAULT_BACKEND_PORT"
  local saved_backend_node_env="$BACKEND_NODE_ENV_DEFAULT"
  local saved_codenames_pictures_dir="$CODENAMES_PICTURES_DIR_DEFAULT"
  local saved_fbg_images_cache_dir="$FBG_IMAGES_CACHE_DIR_DEFAULT"
  if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
    saved_web_port="${WEB_PORT:-$saved_web_port}"
    saved_bgio_port="${BGIO_PORT:-$saved_bgio_port}"
    saved_backend_port="${BACKEND_PORT:-$saved_backend_port}"
    saved_backend_node_env="${BACKEND_NODE_ENV:-$saved_backend_node_env}"
    saved_codenames_pictures_dir="${CODENAMES_PICTURES_DIR:-$saved_codenames_pictures_dir}"
    saved_fbg_images_cache_dir="${FBG_IMAGES_CACHE_DIR:-$saved_fbg_images_cache_dir}"
  fi
  parse_public_url "$url"
  ensure_dirs
  python3 - "$CONFIG_FILE" "$PUBLIC_URL" "$SITE_ADDRESS" "$PUBLIC_HOSTPORT" "$saved_web_port" "$saved_bgio_port" "$saved_backend_port" "$saved_backend_node_env" "$saved_codenames_pictures_dir" "$saved_fbg_images_cache_dir" <<'PY'
from pathlib import Path
import shlex
import sys
keys = [
    'PUBLIC_URL', 'SITE_ADDRESS', 'PUBLIC_HOSTPORT', 'WEB_PORT', 'BGIO_PORT',
    'BACKEND_PORT', 'BACKEND_NODE_ENV', 'CODENAMES_PICTURES_DIR', 'FBG_IMAGES_CACHE_DIR',
]
path = Path(sys.argv[1])
values = sys.argv[2:]
path.write_text(''.join(f'{key}={shlex.quote(value)}\n' for key, value in zip(keys, values)))
PY
}

load_config() {
  [[ -f "$CONFIG_FILE" ]] || die "Missing $CONFIG_FILE. Run ./self_host.zsh setup [public_url] first."
  source "$CONFIG_FILE"
  PUBLIC_URL="${PUBLIC_URL:-$DEFAULT_PUBLIC_URL}"
  SITE_ADDRESS="${SITE_ADDRESS:-}"
  PUBLIC_HOSTPORT="${PUBLIC_HOSTPORT:-}"
  WEB_PORT="${WEB_PORT:-3000}"
  BGIO_PORT="${BGIO_PORT:-8001}"
  BACKEND_PORT="${BACKEND_PORT:-3001}"
  BACKEND_NODE_ENV="${BACKEND_NODE_ENV:-development}"
  CODENAMES_PICTURES_DIR="${CODENAMES_PICTURES_DIR:-$CODENAMES_PICTURES_DIR_DEFAULT}"
  FBG_IMAGES_CACHE_DIR="${FBG_IMAGES_CACHE_DIR:-$FBG_IMAGES_CACHE_DIR_DEFAULT}"
  [[ -n "$SITE_ADDRESS" && -n "$PUBLIC_HOSTPORT" ]] || {
    parse_public_url "$PUBLIC_URL"
  }
}

resolve_url_for_write() {
  if [[ -n "${1:-}" ]]; then
    normalize_public_url "$1" || die 'Invalid public URL'
  elif [[ -f "$CONFIG_FILE" ]]; then
    load_config
    normalize_public_url "$PUBLIC_URL" || die 'Saved public URL is invalid'
  else
    normalize_public_url "$DEFAULT_PUBLIC_URL" || die 'Default public URL is invalid'
  fi
}

ensure_node_shell() {
  zsh -lc 'source ~/.shared.sh >/dev/null 2>&1 || true; type nvm-load >/dev/null 2>&1' \
    || die 'nvm-load is required in zsh login shells'
}

ensure_pnpm_shell() {
  run_in_node_shell "command -v pnpm >/dev/null 2>&1 || { command -v corepack >/dev/null 2>&1 && corepack enable >/dev/null 2>&1 && corepack prepare pnpm@${(q)PNPM_VERSION} --activate >/dev/null 2>&1; }; pnpm --version | grep -Eq '^${(q)PNPM_MAJOR}\\.'" \
    || die "pnpm ${PNPM_MAJOR}.x is required in Node ${NODE_VERSION} shells"
}

run_in_node_shell() {
  local command_string="$1"
  zsh -lc "source ~/.shared.sh >/dev/null 2>&1 || true; nvm-load >/dev/null 2>&1; nvm use ${(q)NODE_VERSION} >/dev/null; cd ${(q)ROOT_DIR}; ${command_string}"
}

caddy_block() {
  local mode="$1"
  local root_quoted static_root next_root
  static_root="$ROOT_DIR/web/public/static"
  next_root="$ROOT_DIR/web/.next/static"

  cat <<EOF_BLOCK
$SITE_ADDRESS {
    encode zstd gzip

    @graphql {
        path /graphql*
    }
    reverse_proxy @graphql 127.0.0.1:$BACKEND_PORT

    @bgio {
        path /socket.io* /games/*
    }
    reverse_proxy @bgio 127.0.0.1:$BGIO_PORT
EOF_BLOCK

  if [[ "$mode" == 'prod' ]]; then
    cat <<EOF_BLOCK

    handle /_next/static/* {
        root * $next_root
        uri strip_prefix /_next/static
        file_server
    }

    handle /static/* {
        root * $static_root
        uri strip_prefix /static
        file_server
    }
EOF_BLOCK
  fi

  cat <<EOF_BLOCK

    reverse_proxy 127.0.0.1:$WEB_PORT
}
EOF_BLOCK
}

write_caddy_block() {
  local mode="$1"
  ensure_dirs
  local block_file="$STATE_DIR/Caddyfile.block"
  local candidate_file="$STATE_DIR/Caddyfile.candidate"
  caddy_block "$mode" > "$block_file"
  python3 - "$CADDYFILE" "$block_file" "$candidate_file" "$CADDY_BEGIN" "$CADDY_END" <<'PY'
from pathlib import Path
import re
import sys
caddyfile = Path(sys.argv[1]).expanduser()
block = Path(sys.argv[2]).read_text().rstrip() + '\n'
candidate = Path(sys.argv[3])
begin = sys.argv[4]
end = sys.argv[5]
text = caddyfile.read_text() if caddyfile.exists() else ''
managed = f'{begin}\n{block}{end}\n'
pattern = re.compile(re.escape(begin) + r'.*?' + re.escape(end) + r'\n?', re.S)
if pattern.search(text):
    text = pattern.sub(managed, text)
else:
    text = text.rstrip() + ('\n\n' if text.strip() else '') + managed
candidate.write_text(text)
PY
  if ! caddy validate --config "$candidate_file" --adapter caddyfile >/dev/null 2>&1; then
    caddy validate --config "$candidate_file" --adapter caddyfile
    die "Caddy validation failed for generated config."
  fi
  mkdir -p "${CADDYFILE:h}"
  cp "$candidate_file" "$CADDYFILE"
  note "Updated $CADDYFILE"
}

reload_caddy() {
  note "Reloading Caddy"
  if caddy reload --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    return
  fi
  if pgrep -x caddy >/dev/null 2>&1; then
    die "Caddy is running but reload failed. Validate with: caddy validate --config ${(q)CADDYFILE} --adapter caddyfile"
  fi
  local caddy_log="$LOG_DIR/caddy.log"
  note "Caddy was not running; starting it in the background (log: $caddy_log)"
  if [[ "${CADDY_USE_SUDO:-false}" == 'true' ]]; then
    sudo -E caddy run --config "$CADDYFILE" --adapter caddyfile >"$caddy_log" 2>&1 < /dev/null &!
  else
    caddy run --config "$CADDYFILE" --adapter caddyfile >"$caddy_log" 2>&1 < /dev/null &!
  fi
}

stop_tmux_session() {
  tmux kill-session -t "$1" >/dev/null 2>&1 || true
}

stop_all_sessions() {
  note 'Stopping FreeBoardGames self-host tmux sessions'
  stop_tmux_session "$PROD_WEB_SESSION"
  stop_tmux_session "$PROD_BGIO_SESSION"
  stop_tmux_session "$PROD_BACKEND_SESSION"
  stop_tmux_session "$DEV_WEB_SESSION"
  stop_tmux_session "$DEV_BGIO_SESSION"
  stop_tmux_session "$DEV_BACKEND_SESSION"
}

tmuxnew() {
  local session="$1"
  shift
  stop_tmux_session "$session"
  tmux new-session -d -s "$session" "$@"
}

tmux_env_prefix() {
  cat <<EOF_ENV
set -euo pipefail;
source ~/.shared.sh >/dev/null 2>&1 || true;
nvm-load >/dev/null 2>&1;
nvm use ${(q)NODE_VERSION} >/dev/null;
export CODENAMES_PICTURES_DIR=${(q)CODENAMES_PICTURES_DIR};
export FBG_IMAGES_CACHE_DIR=${(q)FBG_IMAGES_CACHE_DIR};
EOF_ENV
}

ensure_build_artifacts() {
  [[ -f "$ROOT_DIR/web/server/dist/server_web.js" ]] || die 'Missing web/server/dist/server_web.js. Run setup or redeploy first.'
  [[ -f "$ROOT_DIR/web/server/dist/server_bgio.js" ]] || die 'Missing web/server/dist/server_bgio.js. Run setup or redeploy first.'
  [[ -f "$ROOT_DIR/web/.next/BUILD_ID" ]] || die 'Missing web/.next/BUILD_ID. Run setup or redeploy first.'
  [[ -f "$ROOT_DIR/fbg-server/dist/main.js" ]] || die 'Missing fbg-server/dist/main.js. Run setup or redeploy first.'
}

install_dependencies() {
  note 'Installing dependencies with frozen pnpm lockfile'
  run_in_node_shell 'pnpm install --frozen-lockfile --prefer-offline'
}

canonical_game_name() {
  local raw="$1"
  local normalized="${(L)raw}"
  normalized="${normalized//-/}"
  normalized="${normalized//_/}"
  normalized="${normalized// /}"
  case "$normalized" in
    secretname|secretnames|secretcode|secretcodes)
      print -r -- 'secretcodes'
      ;;
    *)
      print -r -- "$raw"
      ;;
  esac
}

is_known_game() {
  local game="$1"
  [[ -f "$ROOT_DIR/web/src/games/$game/index.ts" ]]
}

is_url_like() {
  local value="$1"
  [[ "$value" == *://* || "$value" == *.* || "$value" == *:* || "$value" == localhost ]]
}

parse_deploy_args() {
  SELECTED_PUBLIC_URL=''
  SELECTED_GAMES=()

  local total_args=$#
  local arg raw_game game
  for arg in "$@"; do
    if [[ "$arg" == *,* ]] && ! is_url_like "$arg"; then
      for raw_game in ${(s:,:)arg}; do
        game="$(canonical_game_name "$raw_game")"
        is_known_game "$game" || die "Unknown game '$raw_game'. Expected a directory under web/src/games/."
        SELECTED_GAMES+=("$game")
      done
      continue
    fi

    game="$(canonical_game_name "$arg")"
    if is_known_game "$game"; then
      SELECTED_GAMES+=("$game")
    elif [[ -z "$SELECTED_PUBLIC_URL" ]] && { (( total_args == 1 )) || is_url_like "$arg"; }; then
      SELECTED_PUBLIC_URL="$arg"
    else
      die "Unknown game '$arg'. Expected a directory under web/src/games/. Put the optional public_url first if needed."
    fi
  done

  if (( ${#SELECTED_GAMES[@]} == 0 )); then
    SELECTED_GAMES=("${DEFAULT_DEPLOY_GAMES[@]}")
  fi
}

build_all() {
  local -a games=("$@")
  local games_csv="${(j:,:)games}"
  local games_label="${(j:, :)games}"
  local games_index="$ROOT_DIR/web/src/games/index.ts"
  local games_index_backup="$STATE_DIR/games.index.ts.before-selfhost.$$"

  ensure_dirs
  note "Generating code and building production artifacts for games: $games_label"
  cp "$games_index" "$games_index_backup"
  {
    run_in_node_shell "pnpm run codegen ${(q)games_csv}"
    run_in_node_shell 'pnpm --dir web run i18n:copy'
    run_in_node_shell 'pnpm run build'
    run_in_node_shell 'pnpm --dir fbg-server run build'
  } always {
    cp "$games_index_backup" "$games_index"
    rm -f "$games_index_backup"
  }
}

warn_missing_picture_tools() {
  if ! command -v avifenc >/dev/null 2>&1 || ! command -v convert >/dev/null 2>&1; then
    note 'Warning: Secret Codes picture mode expects avifenc and ImageMagick convert on the host.'
  fi
}

start_production_sessions() {
  load_config
  ensure_build_artifacts
  warn_missing_picture_tools
  stop_all_sessions

  local prefix
  prefix="$(tmux_env_prefix)"
  local force_db_sync="${FORCE_DB_SYNC:-true}"
  local jwt_secret="${JWT_SECRET:-unsafe-self-host-secret}"
  local redis_host="${FBG_REDIS_HOST:-127.0.0.1}"
  local redis_port="${FBG_REDIS_PORT:-6379}"
  local redis_password="${FBG_REDIS_PASSWORD:-}"
  local web_cmd="${prefix} cd ${(q)ROOT_DIR}/web; NODE_ENV=production CHANNEL=production SERVER_PORT=${(q)WEB_PORT} FBG_BACKEND_TARGET=http://127.0.0.1:${(q)BACKEND_PORT} FBG_BGIO_TARGET=http://127.0.0.1:${(q)BGIO_PORT} BGIO_PRIVATE_SERVERS=http://127.0.0.1:${(q)BGIO_PORT} exec node server/dist/server_web.js >> ${(q)LOG_DIR}/web.log 2>&1"
  local bgio_cmd="${prefix} cd ${(q)ROOT_DIR}/web; BGIO_PORT=${(q)BGIO_PORT} BGIO_PUBLIC_SERVERS=${(q)PUBLIC_URL} BGIO_ALLOWED_ORIGINS=${(q)PUBLIC_URL} BGIO_PRIVATE_SERVERS=http://127.0.0.1:${(q)BGIO_PORT} exec node server/dist/server_bgio.js >> ${(q)LOG_DIR}/bgio.log 2>&1"
  local backend_cmd="${prefix} cd ${(q)ROOT_DIR}/fbg-server; NODE_ENV=${(q)BACKEND_NODE_ENV} FORCE_DB_SYNC=${(q)force_db_sync} JWT_SECRET=${(q)jwt_secret} BGIO_PRIVATE_SERVERS=http://127.0.0.1:${(q)BGIO_PORT} BGIO_PUBLIC_SERVERS=${(q)PUBLIC_URL} FBG_REDIS_HOST=${(q)redis_host} FBG_REDIS_PORT=${(q)redis_port} FBG_REDIS_PASSWORD=${(q)redis_password} exec node dist/main.js >> ${(q)LOG_DIR}/backend.log 2>&1"

  tmuxnew "$PROD_WEB_SESSION" zsh -lc "$web_cmd"
  tmuxnew "$PROD_BGIO_SESSION" zsh -lc "$bgio_cmd"
  tmuxnew "$PROD_BACKEND_SESSION" zsh -lc "$backend_cmd"
  note "Started production sessions: $PROD_WEB_SESSION, $PROD_BGIO_SESSION, $PROD_BACKEND_SESSION"
}

start_dev_sessions() {
  load_config
  warn_missing_picture_tools
  stop_all_sessions

  local prefix
  prefix="$(tmux_env_prefix)"
  local force_db_sync="${FORCE_DB_SYNC:-true}"
  local jwt_secret="${JWT_SECRET:-unsafe-self-host-secret}"
  local web_cmd="${prefix} cd ${(q)ROOT_DIR}/web; pnpm run i18n:watch >> ${(q)LOG_DIR}/web-dev-i18n.log 2>&1 & i18n_pid=\$!; NODE_OPTIONS=--openssl-legacy-provider pnpm exec webpack --mode development --color --config webpack.server.config.js --watch >> ${(q)LOG_DIR}/web-dev-webpack.log 2>&1 & webpack_pid=\$!; trap 'kill \$i18n_pid \$webpack_pid 2>/dev/null || true' EXIT INT TERM; NODE_ENV=development CHANNEL=development SERVER_PORT=${(q)WEB_PORT} FBG_BACKEND_TARGET=http://127.0.0.1:${(q)BACKEND_PORT} FBG_BGIO_TARGET=http://127.0.0.1:${(q)BGIO_PORT} BGIO_PRIVATE_SERVERS=http://127.0.0.1:${(q)BGIO_PORT} pnpm exec nodemon --watch server/dist/server_web.js --delay 1 --exec 'node server/dist/server_web.js' >> ${(q)LOG_DIR}/web-dev.log 2>&1"
  local bgio_cmd="${prefix} cd ${(q)ROOT_DIR}/web; BGIO_PORT=${(q)BGIO_PORT} BGIO_PUBLIC_SERVERS=${(q)PUBLIC_URL} BGIO_ALLOWED_ORIGINS=${(q)PUBLIC_URL} BGIO_PRIVATE_SERVERS=http://127.0.0.1:${(q)BGIO_PORT} exec pnpm run bgio:dev >> ${(q)LOG_DIR}/bgio-dev.log 2>&1"
  local backend_cmd="${prefix} cd ${(q)ROOT_DIR}/fbg-server; NODE_ENV=development FORCE_DB_SYNC=${(q)force_db_sync} JWT_SECRET=${(q)jwt_secret} BGIO_PRIVATE_SERVERS=http://127.0.0.1:${(q)BGIO_PORT} BGIO_PUBLIC_SERVERS=${(q)PUBLIC_URL} exec pnpm run start:dev >> ${(q)LOG_DIR}/backend-dev.log 2>&1"

  tmuxnew "$DEV_WEB_SESSION" zsh -lc "$web_cmd"
  tmuxnew "$DEV_BGIO_SESSION" zsh -lc "$bgio_cmd"
  tmuxnew "$DEV_BACKEND_SESSION" zsh -lc "$backend_cmd"
  note "Started development sessions: $DEV_WEB_SESSION, $DEV_BGIO_SESSION, $DEV_BACKEND_SESSION"
}

configure_url() {
  local url
  if [[ -n "${1:-}" ]]; then
    url="$(normalize_public_url "$1")" || die 'Invalid public URL'
    write_config "$url"
  elif [[ -f "$CONFIG_FILE" ]]; then
    load_config
  else
    url="$(normalize_public_url "$DEFAULT_PUBLIC_URL")" || die 'Default public URL is invalid'
    write_config "$url"
  fi
}

setup_cmd() {
  parse_deploy_args "$@"
  ensure_node_shell
  ensure_pnpm_shell
  configure_url "${SELECTED_PUBLIC_URL:-$DEFAULT_PUBLIC_URL}"
  load_config
  stop_all_sessions
  install_dependencies
  build_all "${SELECTED_GAMES[@]}"
  write_caddy_block prod
  reload_caddy
  start_production_sessions
  note "FreeBoardGames is available at $PUBLIC_URL"
}

redeploy_cmd() {
  parse_deploy_args "$@"
  ensure_node_shell
  ensure_pnpm_shell
  configure_url "${SELECTED_PUBLIC_URL:-}"
  load_config
  install_dependencies
  build_all "${SELECTED_GAMES[@]}"
  write_caddy_block prod
  reload_caddy
  start_production_sessions
  note "Redeployed FreeBoardGames at $PUBLIC_URL"
}

start_cmd() {
  configure_url "${1:-}"
  load_config
  write_caddy_block prod
  reload_caddy
  start_production_sessions
  note "Started FreeBoardGames at $PUBLIC_URL"
}

dev_start_cmd() {
  ensure_node_shell
  ensure_pnpm_shell
  configure_url "${1:-}"
  load_config
  write_caddy_block dev
  reload_caddy
  start_dev_sessions
  note "Started FreeBoardGames development mode at $PUBLIC_URL"
}

stop_cmd() {
  stop_all_sessions
}

main() {
  local command="${1:-}"
  case "$command" in
    setup)
      require_command python3
      require_command tmux
      require_command caddy
      setup_cmd "${@:2}"
      ;;
    redeploy)
      require_command python3
      require_command tmux
      require_command caddy
      redeploy_cmd "${@:2}"
      ;;
    start)
      require_command python3
      require_command tmux
      require_command caddy
      start_cmd "${2:-}"
      ;;
    dev-start)
      require_command python3
      require_command tmux
      require_command caddy
      dev_start_cmd "${2:-}"
      ;;
    stop)
      require_command tmux
      stop_cmd
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"

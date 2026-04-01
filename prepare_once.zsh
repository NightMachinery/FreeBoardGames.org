#!/usr/bin/env zsh
export PS4='> '
setopt LOCAL_OPTIONS PIPE_FAIL PRINT_EXIT_VALUE ERR_RETURN SOURCE_TRACE XTRACE
setopt TYPESET_SILENT NO_CASE_GLOB multios re_match_pcre extendedglob pipefail interactivecomments hash_executables_only

nvm-load || true  #: lazy-loading nvm (specific to my setup, ignore)
nvm use 16

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

DEFAULT_CODENAMES_PICTURES_DIR="${DEFAULT_CODENAMES_PICTURES_DIR:-~/Pictures/SurrealPictures/chosen_2}"
DEFAULT_FBG_IMAGES_CACHE_DIR="${DEFAULT_FBG_IMAGES_CACHE_DIR:-~/.cache/talespin/cards}"

say() { print -r -- "$@"; }

FORCE_BUILD="false"
for arg in "$@"; do
  case "$arg" in
    --force) FORCE_BUILD="true" ;;
    *)
      say "Unknown arg: $arg"
      say "Usage: ./prepare_once.zsh [--force]"
      exit 1
      ;;
  esac
done

# Read existing env for defaults (if any).
DEFAULT_HOST="fbg.lilf.ir"
if [[ -f .env.local ]]; then
  set -a
  source ./.env.local
  set +a
  if [[ -n "${PUBLIC_HOST:-}" ]]; then
    DEFAULT_HOST="$PUBLIC_HOST"
  elif [[ -n "${PUBLIC_URL:-}" ]]; then
    DEFAULT_HOST="${PUBLIC_URL#http://}"
    DEFAULT_HOST="${DEFAULT_HOST#https://}"
    DEFAULT_HOST="${DEFAULT_HOST%%/*}"
  fi
fi

read "INPUT_HOST?Public host (domain/IP) [${DEFAULT_HOST}]: "
HOST="${INPUT_HOST:-$DEFAULT_HOST}"
HOST="${HOST#http://}"
HOST="${HOST#https://}"
HOST="${HOST%%/*}"

PUBLIC_IP=""
if command -v dig >/dev/null 2>&1; then
  PUBLIC_IP="$(dig +short "$HOST" | head -n1 | tr -d '[:space:]')"
  if [[ -z "$PUBLIC_IP" ]]; then
    say "Warning: dig returned no IP for $HOST."
  else
    say "Resolved ${HOST} -> ${PUBLIC_IP}"
  fi
else
  say "Warning: dig not found; skipping DNS lookup."
fi

set_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local esc="${value//\\/\\\\}"
    esc="${esc//&/\\&}"
    sed -i "s|^${key}=.*|${key}=${esc}|" "$file"
  else
    print -r -- "${key}=${value}" >> "$file"
  fi
}

# Create local env defaults if missing.
if [[ ! -f .env.local ]]; then
  JWT_SECRET_VALUE=""
  if command -v openssl >/dev/null 2>&1; then
    JWT_SECRET_VALUE=$(openssl rand -hex 32 || true)
  fi
  if [[ -z "$JWT_SECRET_VALUE" ]]; then
    JWT_SECRET_VALUE="change-me"
  fi

  cat > .env.local <<EOF_ENV
PUBLIC_HOST=${HOST}
PUBLIC_IP=${PUBLIC_IP}
SERVER_PORT=3000
BGIO_PORT=8001
FBG_BACKEND_TARGET=http://127.0.0.1:3001
BGIO_PRIVATE_SERVERS=http://127.0.0.1:8001
BGIO_PUBLIC_SERVERS=
FBG_REDIS_HOST=127.0.0.1
FBG_REDIS_PORT=6379
FBG_REDIS_PASSWORD=
BGIO_ALLOWED_ORIGINS=
FBG_IMAGES_CACHE_DIR=${DEFAULT_FBG_IMAGES_CACHE_DIR}
NODE_ENV=production
CHANNEL=production
FORCE_DB_SYNC=true
JWT_SECRET=${JWT_SECRET_VALUE}
CODENAMES_PICTURES_DIR=${DEFAULT_CODENAMES_PICTURES_DIR}
EOF_ENV
  say "Created .env.local (edit if needed)."
else
  say "Using existing .env.local."
  set_env_var .env.local "PUBLIC_HOST" "$HOST"
  set_env_var .env.local "PUBLIC_URL" ""
  if [[ -n "$PUBLIC_IP" ]]; then
    set_env_var .env.local "PUBLIC_IP" "$PUBLIC_IP"
  fi
  set_env_var .env.local "BGIO_PUBLIC_SERVERS" ""
  if ! grep -q "^FBG_REDIS_HOST=" .env.local; then
    set_env_var .env.local "FBG_REDIS_HOST" "127.0.0.1"
  fi
  if ! grep -q "^FBG_REDIS_PORT=" .env.local; then
    set_env_var .env.local "FBG_REDIS_PORT" "6379"
  fi
  if ! grep -q "^FBG_REDIS_PASSWORD=" .env.local; then
    set_env_var .env.local "FBG_REDIS_PASSWORD" ""
  fi
  if ! grep -q "^BGIO_ALLOWED_ORIGINS=" .env.local; then
    set_env_var .env.local "BGIO_ALLOWED_ORIGINS" ""
  fi
  if ! grep -q "^CODENAMES_PICTURES_DIR=" .env.local; then
    set_env_var .env.local "CODENAMES_PICTURES_DIR" "${DEFAULT_CODENAMES_PICTURES_DIR}"
  fi
  if ! grep -q "^FBG_IMAGES_CACHE_DIR=" .env.local; then
    set_env_var .env.local "FBG_IMAGES_CACHE_DIR" "${DEFAULT_FBG_IMAGES_CACHE_DIR}"
  fi
fi

# Check Redis connectivity if redis-cli is available.
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
if [[ -f .env.local ]]; then
  set -a
  source ./.env.local
  set +a
  REDIS_HOST="${FBG_REDIS_HOST:-$REDIS_HOST}"
  REDIS_PORT="${FBG_REDIS_PORT:-$REDIS_PORT}"
fi
if command -v redis-cli >/dev/null 2>&1; then
  if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping | grep -q "PONG"; then
    say "Warning: redis-cli ping failed for ${REDIS_HOST}:${REDIS_PORT}. Start Redis to enable pubsub."
  else
    say "Redis ping OK (${REDIS_HOST}:${REDIS_PORT})."
  fi
else
  say "Warning: redis-cli not found; skipping Redis ping check."
fi

# Write Caddy configs to repo root (used by run.zsh).
cat > "$ROOT_DIR/caddy_config" <<'EOF_CADDY'
{$PUBLIC_HOST} {
  encode zstd gzip

  @graphql {
    path /graphql*
  }
  @bgio {
    path /socket.io* /games/*
  }
  reverse_proxy @graphql 127.0.0.1:3001
  reverse_proxy @bgio 127.0.0.1:8001
  reverse_proxy 127.0.0.1:3000
}
EOF_CADDY

cat > "$ROOT_DIR/caddy_config_http" <<'EOF_CADDY'
http://{$PUBLIC_HOST} {
  encode zstd gzip

  @graphql {
    path /graphql*
  }
  @bgio {
    path /socket.io* /games/*
  }
  reverse_proxy @graphql 127.0.0.1:3001
  reverse_proxy @bgio 127.0.0.1:8001
  reverse_proxy 127.0.0.1:3000
}
EOF_CADDY

cat > "$ROOT_DIR/caddy_config_self_signed" <<'EOF_CADDY'
{
  auto_https disable_redirects
}

http://{$PUBLIC_HOST} {
  encode zstd gzip

  @graphql {
    path /graphql*
  }
  @bgio {
    path /socket.io* /games/*
  }
  reverse_proxy @graphql 127.0.0.1:3001
  reverse_proxy @bgio 127.0.0.1:8001
  reverse_proxy 127.0.0.1:3000
}

https://{$PUBLIC_HOST} {
  tls internal
  encode zstd gzip

  @graphql {
    path /graphql*
  }
  @bgio {
    path /socket.io* /games/*
  }
  reverse_proxy @graphql 127.0.0.1:3001
  reverse_proxy @bgio 127.0.0.1:8001
  reverse_proxy 127.0.0.1:3000
}
EOF_CADDY

# Install Caddy (Debian/Ubuntu).
if command -v apt-get >/dev/null 2>&1; then
  APT_UPDATE_OK=1
  if ! sudo apt-get update; then
    APT_UPDATE_OK=0
    say "Warning: apt-get update failed. You may have broken/blocked repos."
    say "Fix /etc/apt/sources.list.d/*.list and rerun to install Caddy/tmux."
  fi

  if ! sudo apt-get install -y tmux debian-keyring debian-archive-keyring apt-transport-https curl gnupg libcap2-bin imagemagick libavif-bin; then
    say "Warning: failed to install tmux/curl/gnupg. Continuing without them."
  fi

  if ! command -v caddy >/dev/null 2>&1; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
    if [[ "$APT_UPDATE_OK" -eq 1 ]]; then
      if ! sudo apt-get update; then
        say "Warning: apt-get update failed after adding Caddy repo."
      fi
    fi
    if ! sudo apt-get install -y caddy; then
      say "Warning: failed to install Caddy. Install it manually then rerun this script."
    fi
  else
    say "Caddy already installed."
  fi
else
  say "apt-get not found; install Caddy manually, then rerun this script."
fi

# Install JS dependencies + build artifacts.
yarn install
#: If you get missing modules errors, run `nvm-load ; nvm use 16 ; yarn install` yourself. It seems to work while re-running this script doesn't.
#: `yarn install` also installs these two:
# (cd web && yarn install)
# (cd fbg-server && yarn install)

WEB_BUILT="false"
if [[ -f web/server/dist/server_web.js && -f web/server/dist/server_bgio.js && -d web/.next ]]; then
  WEB_BUILT="true"
fi
BACKEND_BUILT="false"
if [[ -f fbg-server/dist/main.js ]]; then
  BACKEND_BUILT="true"
fi

if [[ "$FORCE_BUILD" == "true" || "$WEB_BUILT" != "true" || "$BACKEND_BUILT" != "true" ]]; then
  yarn run codegen
  (cd web && yarn run i18n:copy)
  yarn run build
  (yarn --cwd fbg-server run build)
else
  say "Build artifacts found; skipping builds (use --force to rebuild)."
fi

# Allow Caddy to bind to 80/443 without systemd, if possible.
if command -v caddy >/dev/null 2>&1 && command -v setcap >/dev/null 2>&1; then
  if ! sudo setcap 'cap_net_bind_service=+ep' "$(command -v caddy)"; then
    say "Warning: setcap failed; you may need to run Caddy with sudo in run.zsh."
  fi
fi

say "Done. You can now run ./run.zsh, ./run.zsh --https, or ./run.zsh --https-self-signed"

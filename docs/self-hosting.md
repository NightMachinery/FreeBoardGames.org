# Self-hosting FreeBoardGames.org

This repo now uses one canonical self-host entrypoint:

```zsh
./self_host.zsh [setup|redeploy|start|stop|dev-start] [public_url]
```

Default public URL:

```text
http://fbg.pinky.lilf.ir
```

`public_url` may be a host-only value or an `http://` / `https://` origin. Path prefixes, query strings, and fragments are not supported.

## Requirements

Install these on the host:

- `zsh`
- `tmux`
- `caddy`
- `python3`
- Node 16 available through `nvm-load` and `nvm use 16`
- Yarn 1.x
- optional for Secret Codes picture mode: `avifenc` and ImageMagick `convert`

If downloads need a proxy, export your proxy variables before running build commands; the script does not hardcode proxy settings.

## What runs

Public traffic is handled by Caddy from `~/Caddyfile`.

Internal processes:

- web / custom Next server: `127.0.0.1:3000`
- BGIO game server: `127.0.0.1:8001`
- GraphQL/backend server: `127.0.0.1:3001`

Production tmux sessions:

- `fbg-selfhost-web`
- `fbg-selfhost-bgio`
- `fbg-selfhost-backend`

Development tmux sessions:

- `fbg-selfhost-web-dev`
- `fbg-selfhost-bgio-dev`
- `fbg-selfhost-backend-dev`

Local state and logs live in `.self_host/`.

## Commands

### `setup`

```zsh
./self_host.zsh setup
./self_host.zsh setup http://fbg.pinky.lilf.ir
./self_host.zsh setup https://example.com
```

`setup` stops existing self-host sessions, persists config, installs dependencies with frozen Yarn lockfiles, builds production artifacts, updates `~/Caddyfile`, reloads or starts Caddy, then starts the production tmux sessions.

### `redeploy`

```zsh
./self_host.zsh redeploy
./self_host.zsh redeploy http://new-host.example
```

Redeploys the latest local checkout. It does not pull from git. It rebuilds, updates Caddy, stops both production and dev sessions, then starts production.

### `start`

```zsh
./self_host.zsh start
./self_host.zsh start http://new-host.example
```

Starts from existing build artifacts and saved config. It rewrites the production Caddy block and stops any `start` or `dev-start` sessions before launching production.

### `dev-start`

```zsh
./self_host.zsh dev-start
./self_host.zsh dev-start http://fbg.pinky.lilf.ir
```

Starts a development-friendly deployment behind Caddy. It runs watcher/dev commands for the web server, BGIO server, and backend, and it proxies all web traffic to the dev web process instead of serving stale static assets from Caddy.

### `stop`

```zsh
./self_host.zsh stop
```

Stops all managed production and development tmux sessions. It does not stop the machine-wide Caddy process.

## Caddy behavior

The script owns only this bounded block in `~/Caddyfile`:

```text
# BEGIN freeboardgames self-host
# END freeboardgames self-host
```

Production routing:

- `/graphql*` -> backend on `127.0.0.1:3001`
- `/socket.io*` and `/games/*` -> BGIO on `127.0.0.1:8001`
- `/_next/static/*` -> Caddy `file_server` from `web/.next/static`
- `/static/*` -> Caddy `file_server` from `web/public/static`
- everything else -> web server on `127.0.0.1:3000`

Development routing keeps the same API/BGIO proxies but sends all remaining requests to the web dev process so hot reload and Next dev assets work correctly.

Set `SELF_HOST_CADDYFILE=/path/to/Caddyfile` to write a different Caddyfile. If Caddy is not already running, the script starts `caddy run` in the background and logs to `.self_host/logs/caddy.log`.

## Runtime config

Saved config is stored at:

```text
.self_host/config.env
```

Useful defaults:

- `WEB_PORT=3000`
- `BGIO_PORT=8001`
- `BACKEND_PORT=3001`
- `BACKEND_NODE_ENV=development`

The backend defaults to development mode for single-host deployments so Redis is not required. To use Redis-backed production backend behavior, edit `.self_host/config.env` after `setup` and set `BACKEND_NODE_ENV=production`, then provide `FBG_REDIS_HOST`, `FBG_REDIS_PORT`, and `FBG_REDIS_PASSWORD` in the shell that starts the app.

## Logs and troubleshooting

Logs are appended under:

```text
.self_host/logs/
```

Useful commands:

```zsh
tmux ls
tmux attach -t fbg-selfhost-web
tmux attach -t fbg-selfhost-bgio
tmux attach -t fbg-selfhost-backend
tail -f .self_host/logs/web.log
tail -f .self_host/logs/bgio.log
tail -f .self_host/logs/backend.log
caddy validate --config ~/Caddyfile --adapter caddyfile
```

If a build artifact is missing, run:

```zsh
./self_host.zsh redeploy
```

If the public scheme needs to change between HTTP and HTTPS, rerun setup or start with the desired full origin:

```zsh
./self_host.zsh setup https://fbg.example.com
```

## Legacy scripts

The old `prepare_once.zsh`, `run.zsh`, and `run_tmux_http.zsh` entrypoints are compatibility shims. New automation should call `self_host.zsh` directly.

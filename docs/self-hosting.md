# Self-hosting FreeBoardGames.org

This repo now uses one canonical self-host entrypoint:

```zsh
./self_host.zsh [setup|redeploy] [--storybook] [public_url] [game ...]
./self_host.zsh [start|dev-start] [public_url]
./self_host.zsh stop
```

Default public URL:

```text
http://fbg.pinky.lilf.ir
```

`public_url` may be a host-only value or an `http://` / `https://` origin. Path prefixes, query strings, and fragments are not supported.

By default, `setup` and `redeploy` build only Secret Codes (`secretcodes`) and skip Storybook docs. Pass one or more game directory names from `web/src/games/` to deploy a different subset. The legacy/user-facing alias `secretnames` is accepted and maps to `secretcodes`. Pass `--storybook` only when you explicitly need to regenerate `web/public/static/docs`.

## Requirements

Install these on the host:

- `zsh`
- `tmux`
- `caddy`
- `python3`
- Node 24 available through `nvm-load` and `nvm use 24`
- pnpm 10.x
- optional for Secret Codes picture mode: `avifenc` and ImageMagick `convert`

If downloads need a proxy, export your proxy variables before running build commands; the script does not hardcode proxy settings.

The self-host flow installs from the workspace `pnpm-lock.yaml` with `pnpm install --frozen-lockfile --prefer-offline`. pnpm hardlinks packages from its content-addressable store, and maintainers can run `pnpm dedupe` (or `pnpm dedupe --check`) when refreshing dependencies to avoid unnecessary duplicate versions.

If redeploy fails during this install step with `ERR_PNPM_FETCH_404` for a package tarball, check whether the lockfile points at an npm version whose tarball has been removed. Keep dependency versions and `pnpm-lock.yaml` in sync, then rerun `pnpm install --frozen-lockfile --prefer-offline`; for example, `v2/fbg-web` uses `next@13.5.11` because the old `next@13.5.0` tarball returns 404 from the npm registry.

If redeploy reaches `apollo client:codegen` and reports duplicate GraphQL modules such as `Cannot use GraphQLScalarType "String" from another module or realm`, run a fresh frozen install after pulling the latest lockfile. The workspace pins Apollo codegen's implicit `graphql` dependency through pnpm package extensions so the web codegen process uses one GraphQL 15 instance.

If the web production build reports React JSX component errors that mention multiple `ReactNode` definitions, make sure the root pnpm overrides are present in the lockfile. The workspace pins `@types/recompose` to the web app's React 17 type package so transitive React 18 types do not leak into the legacy Next build.

If `web build:server` reports missing modules for Babel helpers, CORS, or dotenv, make sure the web package's runtime dependencies are installed from the current lockfile. The self-host server bundle imports `@babel/runtime`, `@koa/cors`, and `dotenv/config` at build/runtime, so they must be declared dependencies rather than incidental transitive packages.

If redeploy fails while validating Caddy with `ambiguous site definition`, remove stale FreeBoardGames blocks or rerun with the current script. The script replaces the canonical `# BEGIN freeboardgames self-host` block and also removes the old `# BEGIN freeboardgames http self-host` block so the same host is not defined twice.

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
./self_host.zsh setup chess tictactoe
./self_host.zsh setup https://example.com secretcodes chess
./self_host.zsh setup --storybook secretcodes
```

`setup` stops existing self-host sessions, persists config, installs dependencies with frozen pnpm lockfile, builds production artifacts for the selected games, updates `~/Caddyfile`, reloads or starts Caddy, then starts the production tmux sessions. It skips the Storybook docs build unless `--storybook` is passed.

### `redeploy`

```zsh
./self_host.zsh redeploy
./self_host.zsh redeploy http://new-host.example
./self_host.zsh redeploy secretnames
./self_host.zsh redeploy http://new-host.example secretcodes chess
./self_host.zsh redeploy --storybook secretcodes
```

Redeploys the latest local checkout. It does not pull from git. It rebuilds the selected games, updates Caddy, stops both production and dev sessions, then starts production. If no games are passed, only `secretcodes` is built and deployed. It skips the Storybook docs build unless `--storybook` is passed.

### `start`

```zsh
./self_host.zsh start
./self_host.zsh start http://new-host.example
```

Starts from existing build artifacts and saved config. It rewrites the production Caddy block and stops any `start` or `dev-start` sessions before launching production. It does not rebuild or change which games are present in the existing artifacts.

### `dev-start`

```zsh
./self_host.zsh dev-start
./self_host.zsh dev-start http://fbg.pinky.lilf.ir
```

Starts a development-friendly deployment behind Caddy. It runs watcher/dev commands for the web server, BGIO server, and backend, and it proxies all web traffic to the dev web process instead of serving stale static assets from Caddy. It does not apply `setup`/`redeploy` game filtering.

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

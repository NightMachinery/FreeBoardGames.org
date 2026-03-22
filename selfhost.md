# Self-hosting (bare metal, no Docker)

This repo can run fully on a single server with tmux + Caddy. The scripts below set up dependencies, build, and run the three services (web, bgio, backend) plus a Caddy reverse proxy.

## What runs on which port

- Web UI + Next server: 3000
- BGIO game server: 8001
- Backend (GraphQL/API): 3001
- Caddy reverse proxy: 80/443 (or 80 if using HTTP only)

## One-time setup

Run once on the server (from repo root):

```
./prepare_once.zsh
```

What it does:
- Prompts for public host (domain or IP) and writes `.env.local`
- Creates Caddy configs: `caddy_config` (HTTPS), `caddy_config_http` (HTTP), and `caddy_config_self_signed` (HTTP + self-signed HTTPS)
- Installs Caddy/tmux (Debian/Ubuntu)
- Installs JS deps in root, `web/`, and `fbg-server/`
- Builds if artifacts are missing (use `--force` to rebuild)

Force rebuild:

```
./prepare_once.zsh --force
```

## Run (tmux)

Start everything (HTTP):

```
./run.zsh
```

Start everything (HTTPS):

```
./run.zsh --https
```

Start everything with both HTTP and self-signed HTTPS:

```
./run.zsh --https-self-signed
```

Tmux sessions created:
- `fbg-caddy`
- `fbg-web`
- `fbg-bgio`
- `fbg-backend`

Stop a session:

```
tmux kill-session -t fbg-web
```

## Caddy routing

Caddy proxies:
- `/graphql` -> backend (3001)
- `/socket.io` and `/games` -> bgio (8001)
- everything else -> web (3000)

Configs:
- `caddy_config` (HTTPS with public certs)
- `caddy_config_http` (HTTP only)
- `caddy_config_self_signed` (HTTP + HTTPS with `tls internal`)

## HTTP vs HTTPS (Iran net blackout)

The client uses WebSockets for GraphQL subscriptions. For non-localhost, it must use:
- `wss://` when the page is HTTPS
- `ws://` when the page is HTTP

We patched the client to pick `ws` vs `wss` based on `window.location.protocol`.

If you cannot obtain a valid TLS cert, you now have two options:

- HTTP only: `./run.zsh`
- HTTP + self-signed HTTPS: `./run.zsh --https-self-signed`

In the self-signed mode, Caddy serves HTTPS with its internal CA (`tls internal`).
Browsers will still warn unless the client device trusts Caddy's CA certificate.

## Redis (pubsub)

Backend uses Redis when running in production mode. Defaults are set in `.env.local`:

```
FBG_REDIS_HOST=127.0.0.1
FBG_REDIS_PORT=6379
FBG_REDIS_PASSWORD=
```

If Redis is not running, start it or the backend will log errors. Test with:

```
redis-cli ping
```

## Notes

- `PUBLIC_HOST` in `.env.local` is the only required public host value. The run script supports `./run.zsh`, `./run.zsh --https`, and `./run.zsh --https-self-signed`.
- If Caddy cannot bind to 80/443, use: `CADDY_USE_SUDO=true ./run.zsh --https` or `CADDY_USE_SUDO=true ./run.zsh --https-self-signed`.

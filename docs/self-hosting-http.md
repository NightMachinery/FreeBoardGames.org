# Self-hosting on plain HTTP with tmux

This is the simplest non-Docker setup for a single VPS.

This HTTP workflow uses its own env file:

- HTTP/tmux workflow: `.env.http.local`
- existing HTTPS/Caddy workflow: `.env.local`

So it does not step on `prepare_once.zsh` / `run.zsh`.

Target host in this guide:

- app URL: `http://pinky.lilf.ir:3000`
- no Caddy
- tmux-managed processes
- local SQLite DB
- backend in development mode to avoid requiring Redis

## What runs

- web server: `127.0.0.1:3000` and public `:3000`
- bgio server: `127.0.0.1:8001`
- backend: `127.0.0.1:3001`

The web server now proxies:

- `/graphql` -> backend
- `/games/*` -> bgio
- `/socket.io/*` -> bgio

So for this setup you only need to expose port `3000` publicly.

## 1) Install OS packages

```bash
sudo apt update
sudo apt install -y git tmux build-essential python3 make g++
```

If `yarn` is missing, install it after loading Node with nvm:

```zsh
nvm-load
nvm use 16
npm install -g yarn
```

## 2) Clone the repo

```bash
git clone https://github.com/freeboardgames/FreeBoardGames.org.git
cd FreeBoardGames.org
chmod +x run_tmux_http.zsh
```

## 3) Create `.env.http.local`

Recommended:

```zsh
./run_tmux_http.zsh env-init pinky.lilf.ir:3000
```

That writes `.env.http.local`.

If you want to write it manually instead:

```bash
cat > .env.http.local <<'EOF'
PUBLIC_HOST=pinky.lilf.ir:3000
PUBLIC_URL=http://pinky.lilf.ir:3000
SERVER_PORT=3000
BGIO_PORT=8001
FBG_BACKEND_TARGET=http://127.0.0.1:3001
BGIO_PRIVATE_SERVERS=http://127.0.0.1:8001
BGIO_PUBLIC_SERVERS=http://pinky.lilf.ir:3000
CHANNEL=production
FORCE_DB_SYNC=true
JWT_SECRET=replace-this-with-a-random-secret
WEB_NODE_ENV=production
BACKEND_NODE_ENV=development
EOF
```

You can also point the script at a different file:

```zsh
ENV_FILE=/path/to/my-http.env ./run_tmux_http.zsh start
```

## 4) Install dependencies and build

Use the helper script:

```zsh
./run_tmux_http.zsh install
```

That command uses:

- your required proxy settings
- `nvm-load`
- `nvm use 16`
- `yarn install`
- codegen and builds

## 5) Start the services

```zsh
./run_tmux_http.zsh start
```

Check status:

```zsh
./run_tmux_http.zsh status
```

View logs:

```zsh
./run_tmux_http.zsh logs web
./run_tmux_http.zsh logs bgio
./run_tmux_http.zsh logs backend
```

Attach to a session:

```zsh
./run_tmux_http.zsh attach web
./run_tmux_http.zsh attach bgio
./run_tmux_http.zsh attach backend
```

Stop everything:

```zsh
./run_tmux_http.zsh stop
```

Restart everything:

```zsh
./run_tmux_http.zsh restart
```

## 6) Open the site

Open:

```text
http://pinky.lilf.ir:3000
```

## Notes

- Keep VPS firewall/security-group access open for TCP `3000`.
- You can keep `3001` and `8001` private.
- `BACKEND_NODE_ENV=development` is intentional here; it avoids Redis for a single-VPS setup.
- If you later want a Redis-backed production backend, set `BACKEND_NODE_ENV=production` and add the Redis env vars before starting.
- HTTPS/Caddy scripts still use `.env.local`; this HTTP workflow reads `.env.http.local`.
- If you want to keep plain HTTP available **and** add self-signed HTTPS on the same host, use the tmux+Caddy flow from `selfhost.md` and run `./run.zsh --https-self-signed`.

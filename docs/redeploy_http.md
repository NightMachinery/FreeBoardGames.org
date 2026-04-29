# Redeploy HTTP app on `pinky.lilf.ir:3000`

This is the reliable redeploy flow for the plain-HTTP tmux setup in this repo.

It does a **real production web build** and then restarts the 3 tmux services:

- web: `3000`
- backend: `3001`
- bgio: `8001`

## Prerequisites

- Run from repo root: `/home/ubuntu/base/FreeBoardGames.org`
- Use Node `24`
- `.env.http.local` should exist and keep `WEB_NODE_ENV=production`

## Redeploy

```bash
cd /home/ubuntu/base/FreeBoardGames.org

source ~/.nvm/nvm.sh
nvm use 24

./run_tmux_http.zsh stop
```

### 1) Build the web server bundle first

`next build` depends on the generated `web/server/dist/next.config.js`, so build this first:

```bash
cd web
pnpm exec webpack --mode production --color --progress --config webpack.server.config.js
```

### 2) Run the full production Next build

Use a larger Node heap on this VPS, otherwise the build may fail with:

- `FATAL ERROR: Reached heap limit`
- `JavaScript heap out of memory`

```bash
cd /home/ubuntu/base/FreeBoardGames.org/web
NEXT_TELEMETRY_DISABLED=1 \
CI=1 \
BABEL_ENV=production \
NODE_ENV=production \
CHANNEL=production \
NODE_OPTIONS="--openssl-legacy-provider --max_old_space_size=2048" \
pnpm exec next build
```

### 3) Build the backend

```bash
cd /home/ubuntu/base/FreeBoardGames.org/fbg-server
pnpm exec nest build
```

### 4) Start the tmux services again

```bash
cd /home/ubuntu/base/FreeBoardGames.org
./run_tmux_http.zsh start
```

## GraphQL schema/codegen note

The redeploy flow runs `pnpm run codegen` before the production build. Apollo codegen reads the checked-in schema at `common/gql/schema.gql`, so that schema must include any GraphQL operations used by the web client. For example, the play-again flow calls the public mutation `publicNextRoom(matchId: String!): String!`; if the schema is stale and only lists `nextRoom`, redeploy fails during `apollo client:codegen` with `Cannot query field "publicNextRoom" on type "Mutation"`.

## Verify

```bash
./run_tmux_http.zsh status
./run_tmux_http.zsh logs web
./run_tmux_http.zsh logs backend
./run_tmux_http.zsh logs bgio
curl --noproxy '*' -I http://127.0.0.1:3000/en
```

Expected:

- all 3 tmux services show `running`
- local web check returns `HTTP/1.1 200 OK`

## Notes

- Do **not** rely on the older dev-mode workaround if you want the actual latest game code live.
- Root `pnpm run build` also builds Storybook; that is not required for app redeploy.
- If `common/gql/schema.gql` changes after backend build, that is usually generated churn from Nest GraphQL schema generation.

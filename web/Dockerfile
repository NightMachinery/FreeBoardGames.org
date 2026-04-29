# web
FROM fbg-common:latest AS common
FROM node:24-bookworm AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends autoconf automake file g++ libtool make nasm libpng-dev \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
RUN groupadd -g 938 appuser && useradd -m -d /appdata -u 997 -g appuser appuser
USER appuser
WORKDIR /appdata

# install and cache app dependencies from the workspace lockfile
COPY --chown=appuser package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json /appdata/
COPY --chown=appuser web/package.json /appdata/web/package.json
COPY --chown=appuser fbg-server/package.json /appdata/fbg-server/package.json
COPY --chown=appuser misc/e2e/package.json /appdata/misc/e2e/package.json
COPY --chown=appuser v2/package.json /appdata/v2/package.json
COPY --chown=appuser v2/fbg-bgio/package.json /appdata/v2/fbg-bgio/package.json
COPY --chown=appuser v2/fbg-games/package.json /appdata/v2/fbg-games/package.json
COPY --chown=appuser v2/fbg-web/package.json /appdata/v2/fbg-web/package.json
RUN pnpm install --filter ./web... --frozen-lockfile --prefer-offline

# config
COPY --chown=appuser web/.env web/tsconfig.server.json web/webpack.server.config.js /appdata/web/

# build server
COPY --chown=appuser web/src /appdata/web/src
COPY --chown=appuser web/server /appdata/web/server
RUN pnpm --dir web run build:server

# build website
ARG GIT_REV
COPY --chown=appuser web/.babelrc web/next.config.js /appdata/web/
COPY --chown=appuser web/public /appdata/web/public
COPY --chown=appuser web/.storybook /appdata/web/.storybook
COPY --chown=appuser web/docs /appdata/web/docs
RUN pnpm --dir web run build

FROM node:24-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends bash imagemagick libavif-bin \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
RUN groupadd -g 938 appuser && useradd -m -d /appdata -u 997 -g appuser appuser
USER appuser
WORKDIR /appdata

COPY --chown=appuser:appuser package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc /appdata/
COPY --chown=appuser:appuser web/package.json /appdata/web/package.json
COPY --chown=appuser:appuser fbg-server/package.json /appdata/fbg-server/package.json
COPY --chown=appuser:appuser misc/e2e/package.json /appdata/misc/e2e/package.json
COPY --chown=appuser:appuser v2/package.json /appdata/v2/package.json
COPY --chown=appuser:appuser v2/fbg-bgio/package.json /appdata/v2/fbg-bgio/package.json
COPY --chown=appuser:appuser v2/fbg-games/package.json /appdata/v2/fbg-games/package.json
COPY --chown=appuser:appuser v2/fbg-web/package.json /appdata/v2/fbg-web/package.json
RUN pnpm install --prod --filter ./web... --frozen-lockfile --prefer-offline

COPY --chown=appuser:appuser web/docker_run.sh /appdata/web/docker_run.sh
COPY --chown=appuser:appuser --from=builder /appdata/web/public /appdata/web/public
COPY --chown=appuser:appuser --from=builder /appdata/web/.next /appdata/web/.next
COPY --chown=appuser:appuser --from=builder /appdata/web/server /appdata/web/server

# internal configs for FreeBoardGames.org
COPY --chown=appuser:appuser --from=common /internal /internal

# run
WORKDIR /appdata/web
CMD ./docker_run.sh

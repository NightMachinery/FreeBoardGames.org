# fbg-server
FROM fbg-common:latest AS common
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
RUN addgroup -g 938 appuser && adduser -h /appdata -S -u 997 -G appuser appuser && rm /bin/su
USER appuser
WORKDIR /appdata

# install and cache app dependencies from the workspace lockfile
COPY --chown=appuser package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json /appdata/
COPY --chown=appuser fbg-server/package.json /appdata/fbg-server/package.json
COPY --chown=appuser web/package.json /appdata/web/package.json
COPY --chown=appuser misc/e2e/package.json /appdata/misc/e2e/package.json
COPY --chown=appuser v2/package.json /appdata/v2/package.json
COPY --chown=appuser v2/fbg-bgio/package.json /appdata/v2/fbg-bgio/package.json
COPY --chown=appuser v2/fbg-games/package.json /appdata/v2/fbg-games/package.json
COPY --chown=appuser v2/fbg-web/package.json /appdata/v2/fbg-web/package.json
RUN pnpm install --filter ./fbg-server... --frozen-lockfile --prefer-offline

# config
COPY --chown=appuser fbg-server/tsconfig.json fbg-server/tsconfig.build.json fbg-server/nest-cli.json /appdata/fbg-server/

# build
COPY --chown=appuser fbg-server/src /appdata/fbg-server/src
RUN pnpm --dir fbg-server run build

FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
RUN addgroup -g 938 appuser && adduser -h /appdata -S -u 997 -G appuser appuser && rm /bin/su
USER appuser
WORKDIR /appdata

COPY --chown=appuser package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json /appdata/
COPY --chown=appuser fbg-server/package.json /appdata/fbg-server/package.json
COPY --chown=appuser web/package.json /appdata/web/package.json
COPY --chown=appuser misc/e2e/package.json /appdata/misc/e2e/package.json
COPY --chown=appuser v2/package.json /appdata/v2/package.json
COPY --chown=appuser v2/fbg-bgio/package.json /appdata/v2/fbg-bgio/package.json
COPY --chown=appuser v2/fbg-games/package.json /appdata/v2/fbg-games/package.json
COPY --chown=appuser v2/fbg-web/package.json /appdata/v2/fbg-web/package.json
RUN pnpm install --prod --filter ./fbg-server... --frozen-lockfile --prefer-offline

COPY --chown=appuser fbg-server/tsconfig.json fbg-server/tsconfig.build.json fbg-server/nest-cli.json /appdata/fbg-server/
COPY --chown=appuser --from=builder /appdata/fbg-server/dist /appdata/fbg-server/dist
# internal configs for FreeBoardGames.org
COPY --chown=appuser --from=common /internal /internal
COPY --chown=appuser --from=common /common /appdata/common

# run
WORKDIR /appdata/fbg-server
CMD pnpm run start:prod

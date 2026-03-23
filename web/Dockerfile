# web
FROM fbg-common:latest AS common
FROM node:16.14-bullseye AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends autoconf automake file g++ libtool make nasm libpng-dev \
 && rm -rf /var/lib/apt/lists/*
RUN groupadd -g 938 appuser && useradd -m -d /appdata -u 997 -g appuser appuser
USER appuser
WORKDIR /appdata

# install and cache app dependencies
COPY --chown=appuser tsconfig.json package.json yarn.lock /appdata/
RUN yarn install && yarn cache clean

# config
COPY --chown=appuser .env tsconfig.server.json webpack.server.config.js /appdata/

# build server
COPY --chown=appuser src /appdata/src
COPY --chown=appuser server /appdata/server
RUN yarn run build:server

# build website
ARG GIT_REV
COPY --chown=appuser .babelrc next.config.js /appdata/
COPY --chown=appuser public /appdata/public
COPY --chown=appuser .storybook /appdata/.storybook
COPY --chown=appuser docs /appdata/docs
RUN yarn run build

FROM node:16.14-bullseye-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends bash imagemagick libavif-bin \
 && rm -rf /var/lib/apt/lists/*
RUN groupadd -g 938 appuser && useradd -m -d /appdata -u 997 -g appuser appuser
USER appuser
WORKDIR /appdata

COPY --chown=appuser:appuser package.json /appdata/
RUN yarn install --production && yarn cache clean

COPY --chown=appuser:appuser docker_run.sh /appdata/
COPY --chown=appuser:appuser --from=builder  /appdata/public /appdata/public
COPY --chown=appuser:appuser --from=builder /appdata/.next /appdata/.next
COPY --chown=appuser:appuser --from=builder /appdata/server /appdata/server

# internal configs for FreeBoardGames.org
COPY --chown=appuser:appuser --from=common /internal /internal

# run
CMD ./docker_run.sh

#!/bin/bash
if [ "$SERVER_TYPE" = "BGIO" ]; then
  pnpm run start:bgio
elif [ "$SERVER_TYPE" = "WEB" ]; then
  NODE_ENV=production pnpm run start:server
fi

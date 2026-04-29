#!/usr/bin/env zsh
emulate -L zsh -o errexit -o nounset -o pipefail

ROOT_DIR="${0:A:h}"
print -u2 -- 'run_tmux_http.zsh is deprecated. Use ./self_host.zsh [setup|redeploy|start|stop|dev-start] [public_url].'

cmd="${1:-start}"
shift || true
case "$cmd" in
  env-init|enable-caddy|enable-caddy-self-signed)
    print -u2 -- "The $cmd workflow has been replaced by ./self_host.zsh setup [public_url], which persists config and manages ~/Caddyfile."
    exec "$ROOT_DIR/self_host.zsh" setup "$@"
    ;;
  install|redeploy)
    exec "$ROOT_DIR/self_host.zsh" redeploy "$@"
    ;;
  start|restart)
    exec "$ROOT_DIR/self_host.zsh" start "$@"
    ;;
  dev-start)
    exec "$ROOT_DIR/self_host.zsh" dev-start "$@"
    ;;
  stop)
    exec "$ROOT_DIR/self_host.zsh" stop
    ;;
  status)
    print -u2 -- 'Status is now available with tmux ls and logs under .self_host/logs/.'
    exec tmux ls
    ;;
  attach|logs)
    print -u2 -- "Deprecated $cmd helper removed. Use tmux attach/capture-pane for sessions named fbg-selfhost-* or inspect .self_host/logs/."
    exit 1
    ;;
  *)
    print -u2 -- "Unknown command: $cmd"
    print -u2 -- 'Usage: ./self_host.zsh [setup|redeploy|start|stop|dev-start] [public_url]'
    exit 1
    ;;
esac

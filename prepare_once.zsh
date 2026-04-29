#!/usr/bin/env zsh
emulate -L zsh -o errexit -o nounset -o pipefail

ROOT_DIR="${0:A:h}"
print -u2 -- 'prepare_once.zsh is deprecated. Use ./self_host.zsh setup [public_url].'

url=''
for arg in "$@"; do
  case "$arg" in
    --force)
      export FORCE_INSTALL=true
      export FORCE_BUILD=true
      ;;
    http://*|https://*|[[:alnum:]]*)
      if [[ -n "$url" ]]; then
        print -u2 -- "Only one public_url is supported."
        exit 1
      fi
      url="$arg"
      ;;
    *)
      print -u2 -- "Unknown deprecated prepare_once.zsh argument: $arg"
      print -u2 -- 'Usage: ./self_host.zsh setup [public_url]'
      exit 1
      ;;
  esac
done

args=(setup)
[[ -z "$url" ]] || args+=("$url")
exec "$ROOT_DIR/self_host.zsh" "${args[@]}"

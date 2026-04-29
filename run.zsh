#!/usr/bin/env zsh
emulate -L zsh -o errexit -o nounset -o pipefail

ROOT_DIR="${0:A:h}"
print -u2 -- 'run.zsh is deprecated. Use ./self_host.zsh start [public_url].'

url=''
for arg in "$@"; do
  case "$arg" in
    --https|--https-self-signed)
      print -u2 -- "Ignoring deprecated $arg flag. Configure the scheme with: ./self_host.zsh setup https://host"
      ;;
    http://*|https://*|[[:alnum:]]*)
      if [[ -n "$url" ]]; then
        print -u2 -- 'Only one public_url is supported.'
        exit 1
      fi
      url="$arg"
      ;;
    *)
      print -u2 -- "Unknown deprecated run.zsh argument: $arg"
      print -u2 -- 'Usage: ./self_host.zsh start [public_url]'
      exit 1
      ;;
  esac
done

args=(start)
[[ -z "$url" ]] || args+=("$url")
exec "$ROOT_DIR/self_host.zsh" "${args[@]}"

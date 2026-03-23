#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

check_tools() {
  require_cmd convert
  require_cmd identify
  require_cmd avifenc
}

normalize() {
  local source_path="$1"
  local cache_path="$2"
  local output_width="$3"
  local output_height="$4"
  local ratio_width="$5"
  local ratio_height="$6"
  local quality="$7"
  local speed="$8"
  local cache_dir tmp_png tmp_avif src_width src_height
  local crop_width crop_height offset_x offset_y

  cache_dir="$(dirname "$cache_path")"
  mkdir -p "$cache_dir"
  tmp_png="$(mktemp "$cache_dir/.secretcodes-cache.XXXXXX.png")"
  tmp_avif="$(mktemp "$cache_dir/.secretcodes-cache.XXXXXX.avif")"
  trap "rm -f -- $(printf '%q ' "$tmp_png" "$tmp_avif")" RETURN

  read -r src_width src_height <<<"$(identify -format '%w %h' "$source_path")"
  if [[ -z "${src_width:-}" || -z "${src_height:-}" ]]; then
    echo "Failed to read source dimensions for $source_path" >&2
    exit 1
  fi

  if (( src_width * ratio_height > src_height * ratio_width )); then
    crop_width=$(( (src_height * ratio_width) / ratio_height ))
    if (( crop_width < 1 )); then
      crop_width=1
    fi
    crop_height=$src_height
    offset_x=$(( (src_width - crop_width) / 2 ))
    offset_y=0
  else
    crop_width=$src_width
    crop_height=$(( (src_width * ratio_height) / ratio_width ))
    if (( crop_height < 1 )); then
      crop_height=1
    fi
    offset_x=0
    offset_y=$(( (src_height - crop_height) / 2 ))
  fi

  convert "$source_path" \
    -crop "${crop_width}x${crop_height}+${offset_x}+${offset_y}" \
    +repage \
    -resize "${output_width}x${output_height}!" \
    "PNG24:$tmp_png"

  avifenc -q "$quality" -s "$speed" "$tmp_png" "$tmp_avif" >/dev/null
  mv "$tmp_avif" "$cache_path"
}

validate() {
  local cache_path="$1"
  local expected_width="$2"
  local expected_height="$3"
  local dims

  dims="$(identify -format '%wx%h' "$cache_path")"
  if [[ "$dims" != "${expected_width}x${expected_height}" ]]; then
    echo "Cached image has dimensions $dims, expected ${expected_width}x${expected_height}" >&2
    exit 1
  fi
}

main() {
  local command="${1:-}"
  case "$command" in
    check)
      check_tools "${2:-novalidate}"
      ;;
    normalize)
      if [[ "$#" -ne 9 ]]; then
        echo "normalize requires: <source> <cache> <width> <height> <ratio_w> <ratio_h> <quality> <speed>" >&2
        exit 1
      fi
      check_tools novalidate
      normalize "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9"
      ;;
    validate)
      if [[ "$#" -ne 4 ]]; then
        echo "validate requires: <cache> <width> <height>" >&2
        exit 1
      fi
      check_tools validate
      validate "$2" "$3" "$4"
      ;;
    *)
      echo "Unknown command: ${command:-<empty>}" >&2
      exit 1
      ;;
  esac
}

main "$@"

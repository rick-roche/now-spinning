#!/usr/bin/env bash
set -euo pipefail

validated_sha=${1:?validated SHA is required}
current_sha=${2:?current SHA is required}

if [[ "$validated_sha" != "$current_sha" ]]; then
  printf 'Deployment declined: main moved from %s to %s\n' "$validated_sha" "$current_sha" >&2
  exit 1
fi

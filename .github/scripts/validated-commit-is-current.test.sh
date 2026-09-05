#!/usr/bin/env bash
set -euo pipefail

script="$(dirname "$0")/validated-commit-is-current.sh"
bash "$script" sha-a sha-a

if bash "$script" sha-a sha-b; then
  printf 'expected a moved branch to decline deployment\n' >&2
  exit 1
fi

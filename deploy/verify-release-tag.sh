#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! "${1:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-[1-9][0-9]*$ ]]; then
  echo 'Release tag must use vX.Y.Z-N with N starting at 1.' >&2
  exit 1
fi

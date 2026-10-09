#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/serve.py "$@"
fi
printf '%s\n' 'Python 3.10+ is required. Install Python, then try again.'
exit 1

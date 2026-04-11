#!/usr/bin/env sh
# Activate the virtualenv and start Flask.
# Called by the root `bun run api` script.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$SCRIPT_DIR/.venv/bin/python"

if [ ! -f "$PYTHON" ]; then
  echo "⚠  .venv not found. Run: bun run install:backend"
  exit 1
fi

exec "$PYTHON" "$SCRIPT_DIR/app.py"

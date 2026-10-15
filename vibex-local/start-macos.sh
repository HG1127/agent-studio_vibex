#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$(uname -s)" in
  Darwin) ;;
  *) echo "Please use the launcher matching your operating system." >&2; exit 1 ;;
esac
command -v node >/dev/null 2>&1 || { echo "Node.js is required." >&2; exit 1; }
cd "$ROOT"
# Retained old filename; runs the standalone employee-auth stack only.
exec node "$ROOT/ops/standalone-dev.mjs"

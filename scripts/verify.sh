#!/usr/bin/env bash
set -euo pipefail

echo "== verify =="

# If pnpm and package.json exist, try running standard scripts
if [ -f package.json ] && command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  SCRIPTS="$(node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).join(' '))")"
  for s in lint test typecheck build; do
    if echo "$SCRIPTS" | grep -qw "$s"; then
      echo "running: pnpm -s $s"
      pnpm -s "$s"
    fi
  done
  echo "verify ok"
  exit 0
fi

echo "No checks configured (ok)"
exit 0

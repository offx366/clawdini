#!/bin/bash
# Clawdini Stop Script

set -e

echo "=== Clawdini Stop Script ==="

# Stop Clawdini server (tsx with index.ts)
if pgrep -f "tsx.*src/index.ts" > /dev/null 2>&1; then
    echo "→ Stopping Server..."
    pkill -f "tsx.*src/index.ts" || true
    sleep 1
    echo "✓ Server stopped"
else
    echo "✓ Server not running"
fi

# Stop UI (vite for clawdini-ui - match by path)
if pgrep -f "apps/ui.*vite" > /dev/null 2>&1 || pgrep -f "clawdini.*vite" > /dev/null 2>&1; then
    echo "→ Stopping UI..."
    pkill -f "apps/ui" || true
    sleep 1
    echo "✓ UI stopped"
else
    echo "✓ UI not running"
fi

# Note: We DO NOT stop OpenClaw Gateway as it's a shared service
echo "✓ OpenClaw Gateway left running (shared service)"

echo "=== All Clawdini services stopped ==="

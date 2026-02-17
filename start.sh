#!/bin/bash
# Clawdini Start Script

set -e

echo "=== Clawdini Start Script ==="

# Check if OpenClaw Gateway is already running
if pgrep -f "openclaw-gateway" > /dev/null 2>&1; then
    echo "✓ OpenClaw Gateway already running"
else
    echo "→ Starting OpenClaw Gateway..."
    openclaw-gateway &
    sleep 2
fi

# Change to project root
cd /root/clawdini

# Check if server is already running (using tsx with index.ts)
if pgrep -f "tsx.*src/index.ts" > /dev/null 2>&1; then
    echo "✓ Server already running"
else
    echo "→ Starting Server..."
    cd /root/clawdini/apps/server
    nohup npx tsx src/index.ts > /tmp/clawdini-server.log 2>&1 &
    sleep 3
fi

# Check if UI is already running
if pgrep -f "vite.*apps/ui" > /dev/null 2>&1; then
    echo "✓ UI already running"
else
    echo "→ Starting UI..."
    cd /root/clawdini/apps/ui
    nohup npx vite > /tmp/clawdini-ui.log 2>&1 &
    sleep 3
fi

echo "=== All services started ==="
echo "UI:    http://localhost:3000"
echo "Server: http://localhost:3001"
echo "Gateway: ws://127.0.0.1:18789"

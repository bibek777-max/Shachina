#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
export PATH="$DIR/.tools/bin:$PATH"
export PYTHONPATH="$DIR"

# Build frontend if needed
if [ ! -d "$DIR/frontend/dist" ] || [ ! -f "$DIR/frontend/dist/index.html" ]; then
    echo "📦 Building frontend application..."
    cd "$DIR/frontend" && npm run build
    cd "$DIR"
fi

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)

echo "================================================================"
echo "⚡ Starting SHACHINA Platform for Bibek..."
echo "📍 Primary Market: NEPSE (Asia/Kathmandu, NPR)"
echo "🔐 Zero-Fabrication Policy: Enforced"
echo ""
echo "📱 Local Network Access (All Mobiles & Laptops on Wi-Fi):"
echo "   👉 http://${LOCAL_IP:-localhost}:8000"
echo "   💻 On this Mac: http://localhost:8000"
echo ""
echo "🌍 For Global Public Internet Access across 4G/5G, run:"
echo "   👉 ./start_public.sh"
echo "================================================================"

$DIR/.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

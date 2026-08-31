#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
export PATH="$DIR/.tools/bin:$PATH"
export PYTHONPATH="$DIR"

# 1. Build frontend if needed
if [ ! -d "$DIR/frontend/dist" ] || [ ! -f "$DIR/frontend/dist/index.html" ]; then
    echo "📦 Building frontend application..."
    cd "$DIR/frontend" && npm run build
    cd "$DIR"
fi

# 2. Detect Local Wi-Fi IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)

echo "================================================================"
echo "⚡ SHACHINA PLATFORM - LIVE & PUBLIC ACCESS SYSTEM"
echo "================================================================"
echo "📍 Primary Market: NEPSE (Asia/Kathmandu, NPR)"
echo "🔐 Zero-Fabrication Policy: Enforced"
echo ""
echo "📱 1. LOCAL WI-FI ACCESS (Any Phone/Laptop on your Wi-Fi):"
echo "   👉 http://${LOCAL_IP:-localhost}:8000"
echo "   💻 On this Mac: http://localhost:8000"
echo ""
echo "🌍 2. GLOBAL PUBLIC INTERNET ACCESS (Any Phone/Laptop anywhere):"
echo "   Starting secure public tunnel..."
echo "================================================================"

# Start backend server in background
$DIR/.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!

cleanup() {
    echo ""
    echo "🛑 Shutting down SHACHINA services..."
    kill $SERVER_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Wait 2 seconds for server to be ready
sleep 2

# Check tunnel options
if command -v cloudflared &>/dev/null; then
    echo "🚀 Using Cloudflare Tunnel for high-speed global access..."
    cloudflared tunnel --url http://localhost:8000
elif command -v ngrok &>/dev/null; then
    echo "🚀 Using ngrok for global access..."
    ngrok http 8000
else
    echo "🚀 Using instant SSH public tunnel (Pinggy / Localhost.run)..."
    echo "   (No installation needed - gives instant public HTTPS URL)"
    echo ""
    ssh -o StrictHostKeyChecking=no -p 443 -R0:localhost:8000 a.pinggy.io 2>/dev/null || ssh -o StrictHostKeyChecking=no -R 80:localhost:8000 localhost.run
fi

wait $SERVER_PID

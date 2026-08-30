#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
export PATH="$DIR/.tools/bin:$PATH"
export PYTHONPATH="$DIR"

echo "⚡ Starting SHACHINA Platform for Bibek..."
echo "📍 Primary Market: NEPSE (Asia/Kathmandu, NPR)"
echo "🔐 Zero-Fabrication Policy: Enforced"

$DIR/.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

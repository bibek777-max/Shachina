#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "================================================================"
echo "⚡ SHACHINA ONE-CLICK 24/7 CLOUD DEPLOYMENT HELPER"
echo "================================================================"
echo ""

echo "📤 Pushing latest commits to GitHub repository (bibek777-max/Shachina)..."
git push origin main

echo ""
echo "✅ Code pushed successfully to GitHub!"
echo "👉 Now open Render to deploy 24/7 with 1 click:"
echo "   https://dashboard.render.com/blueprints/new"
echo "================================================================"

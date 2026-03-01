#!/bin/bash
set -euo pipefail
echo "Building macOS DMG..."
npm install
npm run build:mac
echo "Copy the DMG to /opt/remote-support/packages/support-<SESSION_ID>.dmg"

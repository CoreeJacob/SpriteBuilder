#!/bin/sh
# Builds SpriteBuilder.app and copies it into /Applications. Re-run after changing the code.
set -e
cd "$(dirname "$0")/.."
unset ELECTRON_RUN_AS_NODE
npx electron-vite build
npx electron-builder --mac --dir
APP=$(ls -d dist/mac*/SpriteBuilder.app | head -1)
osascript -e 'quit app "SpriteBuilder"' 2>/dev/null || true
rm -rf /Applications/SpriteBuilder.app
cp -R "$APP" /Applications/
echo "Installed /Applications/SpriteBuilder.app"

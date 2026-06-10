#!/bin/bash
#
# Remote Support Helper — macOS setup / unblock script.
#
# Remote Support Helper is distributed directly by us, not through the Mac App
# Store, so macOS attaches a "quarantine" flag when you download it and then
# refuses to open it with a message like:
#
#     "Remote Support Helper" can't be opened because Apple cannot check it
#     for malicious software.
#
# or, on Apple Silicon (M1/M2/M3) Macs, the harsher variant:
#
#     "Remote Support Helper" is damaged and can't be opened.
#     You should move it to the Trash.
#
# Both messages are the same underlying cause (the download quarantine flag).
# This script removes that flag, re-signs the app locally so Apple Silicon Macs
# accept it, and opens it. It is safe to run and does not need your password
# unless your account is not an administrator.
#
# How to use it: just double-click this file. If macOS says it is from an
# unidentified developer, right-click (or Control-click) it, choose "Open",
# then click "Open" in the dialog.

APP_NAME="Remote Support Helper.app"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "================================================"
echo "  Remote Support Helper — setup"
echo "================================================"
echo

# 1. Make sure the app is in /Applications (copy it from the disk image if not).
if [ ! -d "/Applications/$APP_NAME" ]; then
  if [ -d "$HERE/$APP_NAME" ]; then
    echo "Installing Remote Support Helper into your Applications folder..."
    if ! cp -R "$HERE/$APP_NAME" /Applications/ 2>/dev/null; then
      echo
      echo "Could not copy it automatically."
      echo "Please drag \"Remote Support Helper\" onto the Applications folder"
      echo "shown in this window, then double-click this file again."
      echo
      read -n 1 -s -r -p "Press any key to close..."
      exit 1
    fi
  else
    echo "Could not find \"$APP_NAME\"."
    echo "Open the downloaded disk image (.dmg) and run this from inside it."
    echo
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
  fi
fi

TARGET="/Applications/$APP_NAME"

# 2. Remove the download quarantine so Gatekeeper stops blocking the app.
echo "Clearing the macOS security quarantine..."
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true

# 3. Re-apply an ad-hoc signature. This resolves the "app is damaged" message on
#    Apple Silicon, where the OS rejects an app whose signature does not validate.
echo "Re-signing the app for this Mac..."
codesign --force --deep --sign - "$TARGET" 2>/dev/null || true

# 4. Launch it.
echo "Opening Remote Support Helper..."
open "$TARGET"

echo
echo "Done. Remote Support Helper should now open normally from Applications."
sleep 2

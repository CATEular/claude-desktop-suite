#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
glib-compile-schemas --strict schemas/
PACKAGE_NAME="cream-island-v10-notifications.zip"
FILES=(metadata.json extension.js prefs.js stylesheet.css install.sh uninstall.sh
    schemas/org.gnome.shell.extensions.cream-island.gschema.xml schemas/gschemas.compiled
    modules/*.js scripts/microphone_level.py scripts/capture_performance.py
    README.md docs/PROJECT_SUMMARY.md)
for file in "${FILES[@]}"; do test -f "$file"; done
rm -f "$PACKAGE_NAME"
zip "$PACKAGE_NAME" "${FILES[@]}"
unzip -t "$PACKAGE_NAME"
printf 'Package: %s/%s\n' "$PWD" "$PACKAGE_NAME"

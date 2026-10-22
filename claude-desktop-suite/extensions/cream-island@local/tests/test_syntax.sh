#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Explicit required inputs: missing production/test files are failures.
JS_FILES=(
    "extension.js"
    "prefs.js"
    "modules/appearance.js"
    "modules/batch.js"
    "modules/capsule.js"
    "modules/config.js"
    "modules/controlCenterView.js"
    "modules/dockController.js"
    "modules/islandState.js"
    "modules/launcher.js"
    "modules/layout.js"
    "modules/mediaService.js"
    "modules/mediaView.js"
    "modules/micService.js"
    "modules/mprisUtil.js"
    "modules/notificationCenterView.js"
    "modules/notificationService.js"
    "modules/pageFlow.js"
    "modules/panel.js"
    "modules/powerView.js"
    "modules/pulseSessions.js"
    "modules/runtime.js"
    "modules/storage.js"
    "modules/timerService.js"
    "modules/timerView.js"
    "modules/wallpaperView.js"
    "modules/workspacesView.js"
    "tests/test_appearance_config.js"
    "tests/test_capsule_interaction.js"
    "tests/test_dock_pages.js"
    "tests/test_enable_lifecycle.js"
    "tests/test_event_services.js"
    "tests/test_native_banners.js"
    "tests/test_gi_compat.js"
    "tests/test_island_runtime.js"
    "tests/test_layout.js"
    "tests/test_mic_service.js"
    "tests/test_mpris.js"
    "tests/test_panel_flow.js"
    "tests/test_storage.js"
    "tests/test_timer_math.js"
)
for file in "${JS_FILES[@]}"; do
    test -f "$file"
    node -c "$file"
done
printf 'JavaScript syntax passed: %s required files.\n' "${#JS_FILES[@]}"
SHELL_FILES=(
    "install.sh"
    "uninstall.sh"
    "build_package.sh"
    "tests/test_syntax.sh"
    "tests/run_all_tests.sh"
    "tests/test_gi_compat.sh"
)
for file in "${SHELL_FILES[@]}"; do
    test -f "$file"
    bash -n "$file"
done
python3 - <<'PYTHON'
from pathlib import Path
import json
required = ['scripts/capture_performance.py', 'scripts/microphone_level.py', 'tests/test_microphone_level.py']
for name in required:
    path = Path(name)
    compile(path.read_text(encoding='utf-8'), str(path), 'exec')
metadata = json.loads(Path('metadata.json').read_text())
assert metadata['uuid'] == 'cream-island@local'
assert metadata['version'] == 10
assert '3.36' in metadata['shell-version']
assert Path('schemas/org.gnome.shell.extensions.cream-island.gschema.xml').is_file()
print('Python in-memory syntax, shell syntax and metadata passed.')
PYTHON
glib-compile-schemas --strict schemas/
negative=$(mktemp /tmp/cream-syntax-negative.XXXXXX.js)
trap 'rm -f "$negative"' EXIT
printf 'let broken_syntax = ;\n' > "$negative"
if node -c "$negative" >/dev/null 2>&1; then
    echo 'Negative syntax regression failed.' >&2
    exit 1
fi
echo 'Strict schema compilation and negative syntax regression passed.'

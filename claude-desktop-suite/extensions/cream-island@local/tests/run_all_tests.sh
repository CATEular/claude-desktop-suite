#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Synthetic GStreamer imports must not leave bytecode in the project.
export PYTHONDONTWRITEBYTECODE=1
bash tests/test_syntax.sh
bash tests/test_gi_compat.sh
node tests/test_enable_lifecycle.js
gjs tests/test_layout.js
gjs tests/test_island_runtime.js
gjs tests/test_event_services.js
GSETTINGS_BACKEND=memory gjs tests/test_native_banners.js
gjs tests/test_dock_pages.js
GSETTINGS_BACKEND=memory gjs tests/test_appearance_config.js
gjs tests/test_storage.js
gjs tests/test_timer_math.js
gjs tests/test_mpris.js
node tests/test_capsule_interaction.js
python3 tests/test_microphone_level.py

node tests/test_mic_service.js

node tests/test_panel_flow.js

echo 'Offline checks passed. Real Shell UI, latency and microphone-device acceptance remain unverified.'

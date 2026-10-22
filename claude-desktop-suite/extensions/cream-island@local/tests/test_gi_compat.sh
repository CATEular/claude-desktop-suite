#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Ubuntu 20.04 GNOME 3.36 standalone GJS needs Shell/Mutter runtime paths.
# These variables affect only this read-only test process.
env GI_TYPELIB_PATH="/usr/lib/gnome-shell:/usr/lib/x86_64-linux-gnu/mutter-6${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}" \
    LD_LIBRARY_PATH="/usr/lib/gnome-shell:/usr/lib/x86_64-linux-gnu/mutter-6${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    gjs tests/test_gi_compat.js

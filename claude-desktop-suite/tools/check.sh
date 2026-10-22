#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export PYTHONDONTWRITEBYTECODE=1
bash extensions/cream-island@local/tests/run_all_tests.sh
node tests/test_desktop_effects.js
/usr/bin/python3 tests/test_installer.py
CLAUDE_HEADER_TEMPLATE="$PWD/terminal/headerbar.ui" /usr/bin/python3 desktop/conky/minimal/scripts/test_terminal_template.py
/usr/bin/python3 - <<'PY'
from pathlib import Path
import json
import subprocess
root = Path('.')
for path in sorted(root.rglob('*')):
    if '.git' in path.parts or 'dist' in path.parts or not path.is_file():
        continue
    if path.suffix == '.py':
        compile(path.read_text(), str(path), 'exec')
    elif path.suffix == '.json':
        json.loads(path.read_text())
    elif path.suffix == '.sh':
        subprocess.run(['bash', '-n', str(path)], check=True)
    elif path.suffix == '.js':
        subprocess.run(['node', '--check', str(path)], check=True, capture_output=True)
print('PASS all Python/JSON/shell/JavaScript syntax')
PY
echo 'All offline suite checks passed. Actual Shell display and hardware still require desktop verification.'

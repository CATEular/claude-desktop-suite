#!/usr/bin/env python3
"""Read-only GNOME Shell sample. Does not enable, install, restart or modify settings."""
import argparse
import ast
import json
import os
from pathlib import Path
import subprocess
import time


def shell_diagnostics():
    expression = "JSON.stringify(imports.ui.main.extensionManager.lookup('cream-island@local').stateObj.getPerformanceDiagnostics())"
    try:
        result = subprocess.run([
            'gdbus', 'call', '--session', '--dest', 'org.gnome.Shell',
            '--object-path', '/org/gnome/Shell', '--method', 'org.gnome.Shell.Eval', expression
        ], capture_output=True, text=True, timeout=4)
        if result.returncode:
            return {'available': False, 'reason': 'session DBus unavailable'}
        output = result.stdout.strip()
        if output.startswith('(true,'):
            output = '(True,' + output[6:]
        elif output.startswith('(false,'):
            output = '(False,' + output[7:]
        ok, payload = ast.literal_eval(output)
        if not ok:
            return {'available': False, 'reason': 'Shell Eval or extension diagnostics unavailable'}
        return json.loads(payload)
    except (OSError, ValueError, SyntaxError, subprocess.TimeoutExpired):
        return {'available': False, 'reason': 'read-only Shell diagnostics unavailable'}


def scrub(value):
    # Defensive even if an older/future installed extension returns private text.
    enums = {'Playing', 'Paused', 'Stopped', 'Unknown', 'idle', 'media', 'notification', 'open', 'locked'}
    if isinstance(value, dict):
        return {key: scrub(item) for key, item in value.items() if key not in {'title', 'url', 'artist', 'summary'}}
    if isinstance(value, list):
        return [scrub(item) for item in value]
    if isinstance(value, str):
        return value if value in enums else '[redacted]'
    return value


def shell_pid():
    try:
        output = subprocess.check_output(['pgrep', '-u', str(os.getuid()), '-x', 'gnome-shell'], text=True)
        pids = [int(line) for line in output.split()]
        return pids[0] if len(pids) == 1 else None
    except (OSError, subprocess.CalledProcessError):
        return None


def cpu_ticks(pid):
    # Fields after '(comm)' start with state (field 3).
    fields = Path('/proc/{}/stat'.format(pid)).read_text().rsplit(')', 1)[1].split()
    return int(fields[11]) + int(fields[12]), int(fields[19])


def numeric_counters(report):
    paths = [('counters',), ('dock',), ('popup', 'popup'), ('popup', 'pages'),
             ('popup', 'workspace'), ('media', 'counters')]
    counters = {}
    for path in paths:
        value = report
        for key in path:
            value = value.get(key, {}) if isinstance(value, dict) else {}
        if isinstance(value, dict):
            for key, number in value.items():
                if isinstance(number, (int, float)) and not isinstance(number, bool):
                    counters['.'.join(path + (key,))] = number
    return counters


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=float, default=3.0)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 30:
        parser.error('--seconds must be between 1 and 30')
    before = shell_diagnostics()
    pid = shell_pid()
    sample = None
    if pid is not None:
        try:
            sample = cpu_ticks(pid)
        except (OSError, ValueError):
            pass
    print('Read-only sample: click open/close or switch pages during {:.1f} seconds.'.format(args.seconds), flush=True)
    start = time.monotonic()
    if sample is not None or before.get('available'):
        time.sleep(args.seconds)
    elapsed = time.monotonic() - start
    cpu = {'available': False, 'definition': '100 percent means one CPU core fully occupied; may exceed 100'}
    if sample is not None:
        try:
            after_ticks, identity = cpu_ticks(pid)
            if identity == sample[1] and elapsed > 0:
                cpu.update(available=True, percent=round((after_ticks - sample[0]) / os.sysconf('SC_CLK_TCK') / elapsed * 100, 2),
                           elapsed_seconds=round(elapsed, 3))
        except (OSError, ValueError):
            pass
    after = shell_diagnostics()
    a, b = numeric_counters(before), numeric_counters(after)
    delta = {key: b[key] - a[key] for key in a.keys() & b.keys()}
    output = {'cpu': cpu, 'counter_delta': delta, 'before': scrub(before), 'after': scrub(after)}
    if not before.get('available') or not after.get('available'):
        output['diagnostics_status'] = 'Unavailable: session DBus, Shell Eval, or installed extension diagnostics cannot be accessed.'
    if not cpu['available']:
        output['cpu_status'] = 'Unavailable: no unique readable gnome-shell process in this process namespace.'
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

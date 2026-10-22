#!/usr/bin/python3
"""Run only this suite's four background processes, without touching other Conky."""
import argparse
import fcntl
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

BASE = Path.home() / '.config/conky/minimal'
STATE = Path.home() / '.local/state/claude-desktop-suite'


def commands():
    conky = shutil.which('conky')
    if not conky:
        raise RuntimeError('缺少 conky，请安装 conky-all。')
    return [
        ['/usr/bin/python3', str(BASE / 'scripts/gpu_monitor.py')],
        [conky, '-c', str(BASE / 'system.conf')],
        [conky, '-c', str(BASE / 'processes.conf')],
        ['/usr/bin/python3', str(BASE / 'scripts/interactive_widgets.py')],
    ]


def processes():
    matches = {str(BASE / name) for name in ('scripts/gpu_monitor.py', 'scripts/interactive_widgets.py', 'system.conf', 'processes.conf')}
    found = {}
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            if path.stat().st_uid != os.getuid():
                continue
            args = (path / 'cmdline').read_bytes().decode().split('\0')
            for match in matches.intersection(args):
                found[int(path.name)] = match
        except (OSError, UnicodeError):
            pass
    return found


def stop():
    for pid, target in processes().items():
        if processes().get(pid) != target:
            continue
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + 3
    while processes() and time.monotonic() < deadline:
        time.sleep(0.05)
    if processes():
        raise RuntimeError('部分组件尚未退出，未强制结束；请检查进程后重试。')


def start():
    active = set(processes().values())
    children = []
    with (STATE / 'widgets.log').open('a') as log:
        for command in commands():
            if any(argument in active for argument in command):
                continue
            children.append(subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True))
    time.sleep(0.4)
    if any(child.poll() is not None for child in children):
        raise RuntimeError('组件启动失败，请查看 ' + str(STATE / 'widgets.log'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('start', 'stop', 'restart', 'status'), default='start', nargs='?')
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / 'widgets.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.action in ('stop', 'restart'):
            stop()
        if args.action in ('start', 'restart'):
            start()
        if args.action == 'status':
            for pid, target in processes().items():
                print(pid, target)


if __name__ == '__main__':
    main()

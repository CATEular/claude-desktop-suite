#!/usr/bin/python3
"""Install, enable and restore the user-level Claude desktop suite."""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
UUIDS = ('cream-island@local', 'claude-desktop-effects@local')
STATE = Path('.local/state/claude-desktop-suite')
STYLE_BEGIN = '/* BEGIN CLAUDE DESKTOP SUITE */'
STYLE_END = '/* END CLAUDE DESKTOP SUITE */'


def run(argv, **kwargs):
    return subprocess.run(argv, check=True, text=True, capture_output=True, **kwargs).stdout.strip()


def safe_target(home, relative):
    relative = Path(relative)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Invalid managed path: ' + str(relative))
    target = home / relative
    if os.path.commonpath((str(home.resolve()), str(target.resolve()))) != str(home.resolve()):
        raise ValueError('Managed path escapes the home directory: ' + str(relative))
    return target


def compiled_schema(source):
    with tempfile.TemporaryDirectory(prefix='claude-schema-') as temporary:
        directory = Path(temporary)
        for path in source.glob('*.xml'):
            shutil.copy2(path, directory / path.name)
        run(['glib-compile-schemas', '--strict', str(directory)])
        return (directory / 'gschemas.compiled').read_bytes()


def build_plan(home, data_mount):
    """Build every file in memory; do not touch the destination or session."""
    home = Path(home)
    data_mount = str(Path(data_mount).expanduser().resolve())
    if any(character in data_mount for character in '\n\r{}'):
        raise ValueError('Data mount contains unsupported Conky syntax.')
    plan = {}

    def add(relative, data, mode=0o644):
        safe_target(home, relative)
        plan[str(relative)] = {'data': data.encode() if isinstance(data, str) else data, 'mode': mode}

    for uuid in UUIDS:
        source = ROOT / 'extensions' / uuid
        destination = Path('.local/share/gnome-shell/extensions') / uuid
        for name in ('metadata.json', 'extension.js', 'logic.js', 'prefs.js', 'stylesheet.css', 'settings.py'):
            if (source / name).is_file():
                add(destination / name, (source / name).read_bytes())
        for folder, pattern in (('modules', '*.js'), ('schemas', '*.xml'), ('scripts', 'microphone_level.py')):
            for path in (source / folder).glob(pattern):
                add(destination / folder / path.name, path.read_bytes())
        if (source / 'schemas').is_dir():
            add(destination / 'schemas/gschemas.compiled', compiled_schema(source / 'schemas'))
    source = ROOT / 'desktop/conky/minimal'
    for path in source.rglob('*'):
        if path.is_file() and '__pycache__' not in path.parts:
            data = path.read_bytes()
            if path.suffix == '.conf':
                data = data.decode().replace('@DATA_MOUNT@', data_mount).encode()
            add(Path('.config/conky/minimal') / path.relative_to(source), data,
                0o755 if path.suffix == '.sh' else 0o644)
    # Preserve actual notes/tasks and existing workspace wallpaper choices.
    for name in ('todo', 'notes'):
        relative = f'.config/conky/minimal/data/{name}.json'
        if not safe_target(home, relative).exists():
            add(relative, '[]\n')
    relative = '.config/claude-desktop-effects/settings.json'
    if not safe_target(home, relative).exists():
        add(relative, (ROOT / 'examples/desktop-effects.json').read_bytes())
    add('.local/state/claude-desktop/terminal-ui/headerbar.ui', (ROOT / 'terminal/headerbar.ui').read_bytes())
    css_path = '.config/gtk-3.0/gtk.css'
    current = safe_target(home, css_path)
    css = current.read_text() if current.exists() else ''
    css = re.sub(re.escape(STYLE_BEGIN) + r'.*?' + re.escape(STYLE_END), '', css, flags=re.S).rstrip()
    add(css_path, css + '\n\n' + STYLE_BEGIN + '\n' + (ROOT / 'styles/terminal-header.css').read_text() + '\n' + STYLE_END + '\n')
    overlay = str(home / '.local/state/claude-desktop/terminal-ui')
    mapping = '/org/gnome/terminal/ui=' + overlay
    quoted = mapping.replace('\\', '\\\\').replace('"', '\\"')
    add('.config/systemd/user/gnome-terminal-server.service.d/claude-header.conf',
        '[Service]\nEnvironment="G_RESOURCE_OVERLAYS=' + quoted.replace('%', '%%') + '"\n')
    server = next((str(p) for p in (Path('/usr/libexec/gnome-terminal-server'),
                                    Path('/usr/lib/gnome-terminal/gnome-terminal-server')) if p.exists()), None)
    if server:
        add('.local/share/dbus-1/services/org.gnome.Terminal.service',
            '[D-BUS Service]\nName=org.gnome.Terminal\nSystemdService=gnome-terminal-server.service\n'
            f'Exec=/usr/bin/env "G_RESOURCE_OVERLAYS={quoted}" "{server}"\n')
    settings = str(home / '.local/share/gnome-shell/extensions/claude-desktop-effects@local/settings.py')
    add('.local/bin/desktop-effects', '#!/usr/bin/python3\nimport runpy\nrunpy.run_path(' + repr(settings) + ',run_name="__main__")\n', 0o755)
    add('.local/share/applications/claude-desktop-effects.desktop',
        '[Desktop Entry]\nName=桌面效果\nType=Application\nTerminal=false\nIcon=preferences-desktop-wallpaper\n'
        'Categories=Settings;DesktopSettings;\nExec=/usr/bin/python3 "' + settings.replace('"', '\\"') + '"\n')
    start = str(home / '.config/conky/minimal/start.sh')
    add('.config/autostart/conky-sys-card.desktop',
        '[Desktop Entry]\nType=Application\nName=Claude Desktop Cards\nNoDisplay=true\n'
        'X-GNOME-Autostart-enabled=true\nX-GNOME-Autostart-Delay=5\nExec="' + start.replace('"', '\\"') + '"\n')
    return plan


def write_plan(home, plan):
    """Back up both existing and previously absent files for exact restoration."""
    backup = home / STATE / 'backups' / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True)
    manifest = []
    for relative in plan:
        target = safe_target(home, relative)
        record = {'path': relative, 'kind': 'absent'}
        if relative in ('.config/conky/minimal/data/todo.json', '.config/conky/minimal/data/notes.json'):
            record['preserve'] = True
        if target.is_symlink():
            record.update(kind='symlink', link=os.readlink(target))
        elif target.exists():
            if not target.is_file():
                raise ValueError('Expected a file: ' + str(target))
            record.update(kind='file', mode=target.stat().st_mode & 0o777)
            stored = backup / 'files' / relative
            stored.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, stored)
        manifest.append(record)
    (backup / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    try:
        for relative, entry in plan.items():
            target = safe_target(home, relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.is_symlink():
                target.unlink()
            target.write_bytes(entry['data'])
            target.chmod(entry['mode'])
    except Exception:
        restore_files(home, backup)
        raise
    (home / STATE / 'latest-backup').write_text(str(backup))
    return backup


def restore_files(home, backup):
    for record in reversed(json.loads((backup / 'manifest.json').read_text())):
        target = safe_target(home, record['path'])
        if record.get('preserve') and target.exists():
            continue
        if target.is_symlink() or target.is_file():
            target.unlink()
        elif target.exists():
            raise ValueError('Refusing to replace a directory: ' + str(target))
        if record['kind'] != 'absent':
            target.parent.mkdir(parents=True, exist_ok=True)
        if record['kind'] == 'file':
            shutil.copy2(backup / 'files' / record['path'], target)
            target.chmod(record['mode'])
        elif record['kind'] == 'symlink':
            target.symlink_to(record['link'])


def desktop_session():
    if not shutil.which('gnome-extensions'):
        raise RuntimeError('缺少 gnome-extensions。请在 GNOME 3.36 桌面终端运行。')
    version = run(['gnome-shell', '--version'])
    if not re.search(r'\b3\.36\.', version):
        raise RuntimeError('本套件只支持 GNOME Shell 3.36，当前为：' + version)
    return set(run(['gnome-extensions', 'list', '--enabled']).splitlines())


def disable_ours():
    enabled = desktop_session()
    for uuid in UUIDS:
        if uuid in enabled:
            run(['gnome-extensions', 'disable', uuid])


def latest_backup(home):
    return Path((home / STATE / 'latest-backup').read_text().strip())


def apply_appearance(home):
    desktop_session()
    from gi.repository import Gio, GLib
    profile = Gio.Settings.new('org.gnome.Terminal.ProfilesList').get_string('default')
    prefix = '/org/gnome/terminal/legacy/profiles:/:' + profile + '/'
    settings = json.loads((ROOT / 'examples/appearance.json').read_text())
    values = {prefix + key: value for key, value in settings['terminal'].items()}
    values.update(settings['desktop'])
    before = {key: run(['dconf', 'read', key]) for key in values}
    backup = latest_backup(home)
    snapshot = backup / 'appearance-before.json'
    originals = json.loads(snapshot.read_text()) if snapshot.exists() else {}
    for key, value in before.items():
        originals.setdefault(key, value)
    snapshot.write_text(json.dumps(originals, ensure_ascii=False, indent=2))
    written = []
    try:
        for key, value in values.items():
            signature = 'b' if type(value) is bool else 'i' if type(value) is int else 'as' if isinstance(value, list) else 's'
            run(['dconf', 'write', key, GLib.Variant(signature, value).print_(True)])
            written.append(key)
    except Exception:
        for key in reversed(written):
            run(['dconf', 'write', key, before[key]]) if before[key] else run(['dconf', 'reset', key])
        raise
    print('已应用 Claude 终端配色、20% 透明度和米棕色 Dock。备份：' + str(backup))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('install', 'enable', 'disable', 'apply-appearance', 'restore', 'status'))
    parser.add_argument('--dry-run', action='store_true', help='仅列出计划写入的文件，不连接桌面或写入设置')
    parser.add_argument('--data-mount', default=str(Path.home()), help='Conky 第二块存储的挂载路径')
    parser.add_argument('--backup', type=Path, help='restore 使用的备份目录，默认最近一次安装备份')
    args = parser.parse_args()
    home = Path.home()
    if args.dry_run and args.action != 'install':
        parser.error('--dry-run 仅用于 install')
    if args.action == 'install':
        plan = build_plan(home, args.data_mount)
        if args.dry_run:
            print('\n'.join(sorted(plan)))
            print(f'计划写入 {len(plan)} 个文件；未修改桌面或设置。')
            return
        disable_ours()
        backup = write_plan(home, plan)
        if shutil.which('systemctl'):
            result = subprocess.run(['systemctl', '--user', 'daemon-reload'], capture_output=True, text=True)
            if result.returncode:
                print('请稍后手动运行 systemctl --user daemon-reload。')
        print('已安装，保留现有笔记与活动区设置。备份：' + str(backup))
        print('请先在 X11 按 Alt+F2 → r 重载 Shell，再运行本工具的 enable。')
    elif args.action == 'enable':
        desktop_session()
        run(['/usr/bin/python3', str(home / '.local/share/gnome-shell/extensions/claude-desktop-effects@local/settings.py'), '--apply'])
        run(['gnome-extensions', 'enable', 'cream-island@local'])
        run(['/usr/bin/python3', str(home / '.config/conky/minimal/scripts/widget_service.py'), 'start'])
        print('两项扩展与右侧组件已启用。桌面效果设置：~/.local/bin/desktop-effects')
    elif args.action == 'disable':
        disable_ours()
        run(['/usr/bin/python3', str(home / '.config/conky/minimal/scripts/widget_service.py'), 'stop'])
        print('已停用套件，原生通知横幅恢复。')
    elif args.action == 'apply-appearance':
        apply_appearance(home)
    elif args.action == 'restore':
        backup = (args.backup or latest_backup(home)).resolve()
        if not (backup / 'manifest.json').is_file():
            raise RuntimeError('备份目录缺少 manifest.json。')
        disable_ours()
        service = home / '.config/conky/minimal/scripts/widget_service.py'
        if service.is_file():
            run(['/usr/bin/python3', str(service), 'stop'])
        snapshot = backup / 'appearance-before.json'
        if snapshot.is_file():
            for key, value in json.loads(snapshot.read_text()).items():
                run(['dconf', 'write', key, value]) if value else run(['dconf', 'reset', key])
        restore_files(home, backup)
        print('文件与已备份配色已恢复；请重载 Shell，并运行 systemctl --user daemon-reload。')
        print('按需重新启用之前使用的扩展。待办与笔记数据始终保留。')
    else:
        for uuid in UUIDS:
            print(run(['gnome-extensions', 'info', uuid]))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

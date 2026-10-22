#!/usr/bin/python3
"""Configure workspace wallpapers and hover effects for this GNOME 3.36 desktop."""
import argparse
import json
from pathlib import Path
import sys

import gi
from gi.repository import Gio, GLib

UUID = 'claude-desktop-effects@local'
REVISION = 3
EXTENSION = Path(__file__).resolve().parent
CONFIG = Path.home() / '.config/claude-desktop-effects/settings.json'


def load_config():
    if CONFIG.exists():
        return json.loads(CONFIG.read_text())
    original = Gio.Settings.new('org.gnome.desktop.background').get_string('picture-uri')
    return {'version': 1, 'originalWallpaper': original, 'wallpapers': [original, None, None, None],
            'workspaceWallpapersEnabled': True, 'sidebarHoverEnabled': True,
            'sidebarWorkspaces': None,
            'sidebarRestAngle': 52, 'sidebarHoverPadding': 14, 'sidebarCloseDelay': 350,
            'animationDuration': 260, 'topbarHoverEnabled': True}


def save_config(config):
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    temporary = CONFIG.with_suffix('.tmp')
    temporary.write_text(json.dumps(config, ensure_ascii=False, indent=2))
    temporary.replace(CONFIG)


def shell_eval(code):
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    result = bus.call_sync('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell', 'Eval',
                           GLib.Variant('(s)', (code,)), GLib.VariantType.new('(bs)'),
                           Gio.DBusCallFlags.NONE, 10000, None)
    ok, value = result.unpack()
    if not ok:
        raise RuntimeError('GNOME 未能加载效果：' + value)
    return value


def apply_effects():
    code = '''(() => {
        const Main = imports.ui.main;
        const Gio = imports.gi.Gio;
        const Utils = imports.misc.extensionUtils;
        const manager = Main.extensionManager;
        const uuid = UUID;
        let extension = manager.lookup(uuid);
        if (extension && extension.metadata.version !== REVISION)
            throw new Error('扩展代码已更新。请按 Alt+F2，输入 r 并回车重启 GNOME Shell，再次应用。无需关闭应用。');
        if (!extension) {
            extension = manager.createExtensionObject(uuid, Gio.File.new_for_path(DIRECTORY),
                                                       Utils.ExtensionType.PER_USER);
            manager.loadExtension(extension);
        }
        manager.enableExtension(uuid);
        manager._callExtensionEnable(uuid);
        if (extension.state !== Utils.ExtensionState.ENABLED)
            throw new Error(extension.error || '扩展尚未启用');
        if (extension.stateObj.describe().revision !== REVISION)
            throw new Error('GNOME 仍缓存着旧版代码。请按 Alt+F2，输入 r 并回车，再次应用。');
        extension.stateObj.reloadConfig();
        return extension.stateObj.describe();
    })()'''.replace('const uuid = UUID;', 'const uuid = ' + json.dumps(UUID) + ';')
    code = code.replace('Gio.File.new_for_path(DIRECTORY)',
                        'Gio.File.new_for_path(' + json.dumps(str(EXTENSION)) + ')')
    code = code.replace('!== REVISION', '!== ' + str(REVISION))
    return json.loads(shell_eval(code))


def disable_effects():
    return shell_eval('(() => { const manager = imports.ui.main.extensionManager; '
                      'const uuid = ' + json.dumps(UUID) + '; '
                      'manager.disableExtension(uuid); manager._callExtensionDisable(uuid); return "ok"; })()')


def status():
    return shell_eval('(() => { let e = imports.ui.main.extensionManager.lookup(' + json.dumps(UUID) + '); '
                      'return e && e.stateObj ? e.stateObj.describe() : {enabled:false}; })()')


def configure():
    gi.require_version('Gtk', '3.0')
    from gi.repository import Gtk, GdkPixbuf, Pango
    if not Gtk.init_check()[0]:
        raise RuntimeError('无法连接桌面显示。请在桌面终端运行 desktop-effects。')

    class SettingsWindow(Gtk.Window):
        def __init__(self):
            super().__init__(title='桌面效果')
            self.set_default_size(700, 660)
            self.set_border_width(18)
            self.config = load_config()
            self.rows = []
            selected = self.config.get('sidebarWorkspaces')
            self.workspace_selection = {number: selected is None or number in selected
                                        for number in range(1, 17)}
            self.workspace_checks = []
            outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
            self.add(outer)
            intro = Gtk.Label(label='活动区壁纸 · 侧斜卡片 · 清晰的顶栏', xalign=0)
            outer.pack_start(intro, False, False, 0)
            tabs = Gtk.Notebook()
            outer.pack_start(tabs, True, True, 0)

            wallpaper_page = self.page()
            self.wallpapers_enabled = Gtk.CheckButton(label='为不同活动区使用独立壁纸')
            self.wallpapers_enabled.set_active(self.config.get('workspaceWallpapersEnabled', True))
            wallpaper_page.pack_start(self.wallpapers_enabled, False, False, 0)
            note = Gtk.Label(label='按活动区从上到下编号。未指定的活动区沿用原壁纸。', xalign=0)
            note.set_line_wrap(True)
            wallpaper_page.pack_start(note, False, False, 0)
            count_row = Gtk.Box(spacing=12)
            count_row.pack_start(Gtk.Label(label='设置几个活动区'), False, False, 0)
            self.count = Gtk.SpinButton.new_with_range(1, 16, 1)
            self.count.set_value(max(4, len(self.config.get('wallpapers', [])), max(selected or [1])))
            count_row.pack_start(self.count, False, False, 0)
            wallpaper_page.pack_start(count_row, False, False, 0)
            scroller = Gtk.ScrolledWindow()
            scroller.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
            self.wallpaper_rows = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
            scroller.add(self.wallpaper_rows)
            wallpaper_page.pack_start(scroller, True, True, 0)
            self.rebuild_rows()
            self.count.connect('value-changed', lambda _spin: self.rebuild_rows())
            tabs.append_page(wallpaper_page, Gtk.Label(label='活动区壁纸'))

            sidebar_page = self.page()
            self.sidebar_enabled = Gtk.CheckButton(label='右侧卡片默认侧斜，鼠标靠近时翻正')
            self.sidebar_enabled.set_active(self.config.get('sidebarHoverEnabled', True))
            sidebar_page.pack_start(self.sidebar_enabled, False, False, 0)
            description = Gtk.Label(label='先点击桌面空白处，再悬停翻正；使用其他应用时保持侧斜。待办、笔记仍可点击和编辑。', xalign=0)
            description.set_line_wrap(True)
            sidebar_page.pack_start(description, False, False, 0)
            self.angle = self.numeric_row(sidebar_page, '侧斜角度（度）', 20, 72, self.config.get('sidebarRestAngle', 52))
            self.delay = self.numeric_row(sidebar_page, '移开后等待（毫秒）', 100, 2000, self.config.get('sidebarCloseDelay', 350))
            self.duration = self.numeric_row(sidebar_page, '翻转时长（毫秒）', 80, 700, self.config.get('animationDuration', 260))
            sidebar_page.pack_start(Gtk.Separator(), False, False, 0)
            self.all_workspaces = Gtk.CheckButton(label='在所有活动区显示右侧卡片（包括新建活动区）')
            self.all_workspaces.set_active(selected is None)
            self.all_workspaces.connect('toggled', lambda _button: self.workspace_grid.set_sensitive(
                not self.all_workspaces.get_active()))
            sidebar_page.pack_start(self.all_workspaces, False, False, 0)
            description = Gtk.Label(label='也可取消上方选项，逐个勾选保留卡片的活动区。娱乐区不勾选即可；活动区数量在壁纸页调整。', xalign=0)
            description.set_line_wrap(True)
            sidebar_page.pack_start(description, False, False, 0)
            self.workspace_grid = Gtk.Grid(column_spacing=20, row_spacing=8)
            sidebar_page.pack_start(self.workspace_grid, False, False, 0)
            self.rebuild_workspace_checks()
            tabs.append_page(sidebar_page, Gtk.Label(label='右侧卡片'))

            panel_page = self.page()
            self.panel_enabled = Gtk.CheckButton(label='悬停顶栏时显示 Claude 橙色底和深棕色文字')
            self.panel_enabled.set_active(self.config.get('topbarHoverEnabled', True))
            panel_page.pack_start(self.panel_enabled, False, False, 0)
            description = Gtk.Label(label='悬停背景使用不透明的 Claude 橙色 #D97757，搭配深棕色文字和图标。', xalign=0)
            description.set_line_wrap(True)
            panel_page.pack_start(description, False, False, 0)
            tabs.append_page(panel_page, Gtk.Label(label='顶栏可读性'))

            self.message = Gtk.Label(xalign=0)
            self.message.set_line_wrap(True)
            outer.pack_start(self.message, False, False, 0)
            actions = Gtk.Box(spacing=10)
            stop = Gtk.Button(label='停用效果')
            stop.connect('clicked', self.stop)
            actions.pack_start(stop, False, False, 0)
            save = Gtk.Button(label='保存并应用')
            save.get_style_context().add_class('suggested-action')
            save.connect('clicked', self.save)
            actions.pack_end(save, False, False, 0)
            close = Gtk.Button(label='关闭')
            close.connect('clicked', lambda _button: self.destroy())
            actions.pack_end(close, False, False, 0)
            outer.pack_start(actions, False, False, 0)
            self.connect('destroy', Gtk.main_quit)

        @staticmethod
        def page():
            page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
            page.set_border_width(16)
            return page

        @staticmethod
        def numeric_row(page, title, minimum, maximum, value):
            row = Gtk.Box(spacing=12)
            row.pack_start(Gtk.Label(label=title, xalign=0), True, True, 0)
            spin = Gtk.SpinButton.new_with_range(minimum, maximum, 1)
            spin.set_value(value)
            row.pack_end(spin, False, False, 0)
            page.pack_start(row, False, False, 0)
            return spin

        def rebuild_rows(self):
            uris = [row['uri'] for row in self.rows] if self.rows else self.config.get('wallpapers', [])
            for child in self.wallpaper_rows.get_children():
                child.destroy()
            self.rows = []
            for index in range(self.count.get_value_as_int()):
                box = Gtk.Box(spacing=12)
                preview = Gtk.Image.new_from_icon_name('image-x-generic', Gtk.IconSize.DIALOG)
                preview.set_size_request(94, 62)
                box.pack_start(preview, False, False, 0)
                details = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
                details.pack_start(Gtk.Label(label=f'活动区 {index + 1}', xalign=0), False, False, 0)
                label = Gtk.Label(xalign=0)
                label.set_ellipsize(Pango.EllipsizeMode.MIDDLE)
                label.set_max_width_chars(28)
                details.pack_start(label, False, False, 0)
                box.pack_start(details, True, True, 0)
                row = {'uri': uris[index] if index < len(uris) else None, 'preview': preview, 'label': label}
                choose = Gtk.Button(label='选择图片')
                choose.connect('clicked', lambda _button, current=row: self.choose_wallpaper(current))
                box.pack_end(choose, False, False, 0)
                clear = Gtk.Button(label='清除')
                clear.connect('clicked', lambda _button, current=row: self.set_wallpaper(current, None))
                box.pack_end(clear, False, False, 0)
                self.wallpaper_rows.pack_start(box, False, False, 0)
                self.rows.append(row)
                self.set_wallpaper(row, row['uri'])
            self.wallpaper_rows.show_all()
            if hasattr(self, 'workspace_grid'):
                self.rebuild_workspace_checks()

        def rebuild_workspace_checks(self):
            for number, check in self.workspace_checks:
                self.workspace_selection[number] = check.get_active()
            for child in self.workspace_grid.get_children():
                child.destroy()
            self.workspace_checks = []
            for index in range(self.count.get_value_as_int()):
                number = index + 1
                check = Gtk.CheckButton(label=f'活动区 {number}')
                check.set_active(self.workspace_selection[number])
                self.workspace_grid.attach(check, index % 4, index // 4, 1, 1)
                self.workspace_checks.append((number, check))
            self.workspace_grid.set_sensitive(not self.all_workspaces.get_active())
            self.workspace_grid.show_all()

        def set_wallpaper(self, row, uri):
            row['uri'] = uri
            row['preview'].set_from_icon_name('image-x-generic', Gtk.IconSize.DIALOG)
            filename = Gio.File.new_for_uri(uri).get_path() if uri else None
            row['label'].set_text(Path(filename).name if filename else '未指定，沿用原壁纸')
            row['label'].set_tooltip_text(filename)
            if filename and Path(filename).is_file():
                try:
                    row['preview'].set_from_pixbuf(GdkPixbuf.Pixbuf.new_from_file_at_scale(filename, 94, 62, True))
                except GLib.Error:
                    pass

        def choose_wallpaper(self, row):
            dialog = Gtk.FileChooserDialog(title='选择活动区壁纸', transient_for=self,
                                           action=Gtk.FileChooserAction.OPEN)
            dialog.add_buttons('取消', Gtk.ResponseType.CANCEL, '选择', Gtk.ResponseType.OK)
            images = Gtk.FileFilter()
            images.set_name('图片')
            images.add_pixbuf_formats()
            dialog.add_filter(images)
            if row['uri']:
                dialog.set_uri(row['uri'])
            else:
                directory = Path.home() / 'Pictures/壁纸'
                dialog.set_current_folder(str(directory if directory.exists() else Path.home() / 'Pictures'))
            if dialog.run() == Gtk.ResponseType.OK:
                self.set_wallpaper(row, dialog.get_uri())
            dialog.destroy()

        def save(self, _button):
            self.config.update(wallpapers=[row['uri'] for row in self.rows],
                               workspaceWallpapersEnabled=self.wallpapers_enabled.get_active(),
                               sidebarHoverEnabled=self.sidebar_enabled.get_active(),
                               sidebarWorkspaces=None if self.all_workspaces.get_active() else
                               [number for number, check in self.workspace_checks if check.get_active()],
                               sidebarRestAngle=self.angle.get_value_as_int(),
                               sidebarCloseDelay=self.delay.get_value_as_int(),
                               animationDuration=self.duration.get_value_as_int(),
                               topbarHoverEnabled=self.panel_enabled.get_active())
            save_config(self.config)
            try:
                result = apply_effects()
                self.message.set_text(f"已应用。当前识别到 {result['widgets']} 个右侧桌面组件。")
            except (GLib.Error, RuntimeError) as error:
                self.message.set_text('配置已保存，效果尚未启用：' + str(error))

        def stop(self, _button):
            try:
                disable_effects()
                self.message.set_text('效果已停用，卡片和壁纸已恢复。')
            except (GLib.Error, RuntimeError) as error:
                self.message.set_text(str(error))

    window = SettingsWindow()
    window.show_all()
    Gtk.main()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--apply', action='store_true')
    action.add_argument('--disable', action='store_true')
    action.add_argument('--status', action='store_true')
    action.add_argument('--validate', action='store_true')
    args = parser.parse_args()
    if args.validate:
        config = load_config()
        if not isinstance(config.get('wallpapers'), list):
            raise RuntimeError('壁纸配置必须为列表。')
        workspaces = config.get('sidebarWorkspaces')
        if workspaces is not None and (not isinstance(workspaces, list) or
                any(type(number) is not int or not 1 <= number <= 16 for number in workspaces)):
            raise RuntimeError('卡片活动区必须为 1 到 16 的编号列表，或 null（所有活动区）。')
        for uri in config['wallpapers']:
            if uri and not Gio.File.new_for_uri(uri).query_exists(None):
                raise RuntimeError('壁纸文件不存在：' + uri)
        print('配置格式和已指定的壁纸文件检查通过。')
    elif args.apply:
        print(json.dumps(apply_effects(), ensure_ascii=False))
    elif args.disable:
        disable_effects()
        print('效果已停用。')
    elif args.status:
        print(status())
    else:
        configure()
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, GLib.Error, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

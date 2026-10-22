const { Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

function init() {}

function buildPrefsWidget() {
    let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, border_width: 18 });
    box.add(new Gtk.Label({ label: '活动区壁纸、右侧卡片与顶栏悬停效果' }));
    let button = new Gtk.Button({ label: '打开桌面效果设置' });
    button.connect('clicked', () => {
        let path = ExtensionUtils.getCurrentExtension().dir.get_child('settings.py').get_path();
        Gio.Subprocess.new(['/usr/bin/python3', path], Gio.SubprocessFlags.NONE);
    });
    box.add(button);
    box.show_all();
    return box;
}

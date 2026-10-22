/* prefs.js
 * Cream Island Preferences Dialog for GNOME 3.36 (GTK 3)
 * Black & White Glass Theme & Dimensions Configuration
 */

const { Gio, GLib, GObject, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

function init() {}

function buildPrefsWidget() {
    let settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.cream-island');

    let mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 18,
        margin: 20
    });

    // Title / Description
    let titleBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
    let titleLbl = new Gtk.Label({
        label: '<b><big>Cream Island (黑白玻璃灵动岛) 首选项</big></b>',
        use_markup: true,
        xalign: 0
    });
    let descLbl = new Gtk.Label({
        label: '原生顶栏小球、通知横幅、媒体状态与黑白功能面板；动画遵从系统设置。',
        xalign: 0
    });
    titleBox.pack_start(titleLbl, false, false, 0);
    titleBox.pack_start(descLbl, false, false, 0);
    mainBox.pack_start(titleBox, false, false, 0);

    // Native panel behavior and glass opacity
    let dimFrame = new Gtk.Frame({ label: '原生顶栏与阅读材质' });
    let dimGrid = new Gtk.Grid({
        row_spacing: 12,
        column_spacing: 16,
        margin: 14
    });
    dimFrame.add(dimGrid);

    function createSpin(key, min, max, step, defVal) {
        let curVal = settings ? settings.get_int(key) : defVal;
        let adj = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 2,
            value: (curVal >= min && curVal <= max) ? curVal : defVal
        });
        let spin = new Gtk.SpinButton({ adjustment: adj, numeric: true });
        spin.connect('value-changed', () => {
            if (settings) settings.set_int(key, spin.get_value_as_int());
        });
        return spin;
    }

    let nativeInfo = new Gtk.Label({ label: '顶栏自动适配：静默小球，通知与媒体横幅最多280逻辑像素；不改变顶栏高度。',
        wrap: true, xalign: 0 });
    dimGrid.attach(nativeInfo, 0, 0, 2, 1);

    // Background opacity; popup keeps a 96% readability floor.
    let opLbl = new Gtk.Label({ label: '玻璃不透明度 (60 - 98 %)：', xalign: 0 });
    let opSpin = createSpin('glass-opacity', 60, 98, 1, 89);
    dimGrid.attach(opLbl, 0, 1, 1, 1);
    dimGrid.attach(opSpin, 1, 1, 1, 1);

    mainBox.pack_start(dimFrame, false, false, 0);

    mainBox.pack_start(new Gtk.Label({label:'悬停或 Enter 显示功能图标；点击图标打开页面。',xalign:0}),false,false,0);

    // Frame 3: Behavior & Display
    let displayFrame = new Gtk.Frame({ label: '行为与显示设置' });
    let dBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, margin: 14 });
    displayFrame.add(dBox);

    // Ticker switch
    let tickerRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 });
    let tickerLbl = new Gtk.Label({ label: '在顶栏显示本地B站媒体标题：', xalign: 0, hexpand: true });
    let tickerSwitch = new Gtk.Switch({ active: settings ? settings.get_boolean('capsule-show-media-ticker') : true });
    tickerSwitch.connect('notify::active', () => {
        if (settings) settings.set_boolean('capsule-show-media-ticker', tickerSwitch.active);
    });
    tickerRow.pack_start(tickerLbl, true, true, 0);
    tickerRow.pack_start(tickerSwitch, false, false, 0);
    dBox.pack_start(tickerRow, false, false, 0);

    // Fullscreen auto-hide switch
    let fsRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 });
    let fsLbl = new Gtk.Label({ label: '窗口全屏时自动收起并隐藏展开面板与胶囊：', xalign: 0, hexpand: true });
    let fsSwitch = new Gtk.Switch({ active: settings ? settings.get_boolean('auto-hide-fullscreen') : true });
    fsSwitch.connect('notify::active', () => {
        if (settings) settings.set_boolean('auto-hide-fullscreen', fsSwitch.active);
    });
    fsRow.pack_start(fsLbl, true, true, 0);
    fsRow.pack_start(fsSwitch, false, false, 0);
    dBox.pack_start(fsRow, false, false, 0);

    mainBox.pack_start(displayFrame, false, false, 0);

    // Data storage folder shortcut
    let storageBtn = new Gtk.Button({
        label: '📁 打开用户数据目录 (~/.local/share/cream-island)'
    });
    storageBtn.connect('clicked', () => {
        let dir = GLib.build_filenamev([GLib.get_user_data_dir(), 'cream-island']);
        try {
            Gio.AppInfo.launch_default_for_uri('file://' + dir, null);
        } catch (e) {}
    });
    mainBox.pack_start(storageBtn, false, false, 0);

    mainBox.show_all();
    return mainBox;
}

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const directory = path.join(__dirname, '../extensions/claude-desktop-effects@local');
const logic = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(directory, 'logic.js'), 'utf8'), logic);

assert.equal(logic.normalizeConfig({ sidebarRestAngle: 500 }).sidebarRestAngle, 72);
assert.equal(logic.normalizeConfig({ sidebarRestAngle: -5 }).sidebarRestAngle, 20);
assert.equal(logic.normalizeConfig({ sidebarRestAngle: 'oops' }).sidebarRestAngle, 52);
assert.equal(logic.isDesktopWidget('random window'), false);
assert.equal(logic.isDesktopWidget('ClaudeDesktop-System'), true);
assert.equal(logic.wallpaperForWorkspace({ wallpapers: ['one'], originalWallpaper: 'original' }, 5, 'fallback'), 'original');
assert.equal(logic.containsPoint(null, 0, 0, 20), false);
assert.equal(logic.shouldExpand(false, 500, 100, 350), false);
assert.equal(logic.shouldExpand(false, 400, 100, 350), true);
assert.equal(logic.sidebarOnWorkspace(logic.normalizeConfig({}), 8), true, 'old configurations keep every workspace');
assert.equal(logic.sidebarOnWorkspace(logic.normalizeConfig({ sidebarWorkspaces: [1, 3] }), 0), true);
assert.equal(logic.sidebarOnWorkspace(logic.normalizeConfig({ sidebarWorkspaces: [1, 3] }), 1), false);
assert.equal(logic.sidebarOnWorkspace(logic.normalizeConfig({ sidebarWorkspaces: [] }), 0), false);
assert.equal(JSON.stringify(logic.normalizeConfig({ sidebarWorkspaces: [3, 1, 3, 0, 17, '2', 1.2] }).sidebarWorkspaces), '[1,3]');

let now = 10000;
let pointer = [100, 500];
let workspace = 0;
let nextId = 0;
const timers = new Map();
const handlers = new Map();
const focusHandlers = new Map();
const stageHandlers = new Map();
let focusWindow = null;
let stageFocus = null;
let cancelledMonitor = false;
let wallpaper = 'file:///original.jpg';
let config = {
    wallpapers: ['file:///one.jpg', 'file:///two.jpg'],
    originalWallpaper: wallpaper,
    sidebarRestAngle: 52,
};

class Actor {
    constructor(rect = { x: 0, y: 0, width: 10, height: 10 }) {
        this.rect = rect;
        this._visible = true;
        this._opacity = 255;
        this.rotation_angle_y = 0;
        this.pivot = [0.2, 0.3];
        this.children = [];
        this.classes = new Set();
        this.signals = new Map();
        this.style = null;
        this.animations = 0;
    }
    get_children() { return this.children; }
    has_style_class_name(name) { return this.classes.has(name); }
    add_style_class_name(name) { this.classes.add(name); }
    remove_style_class_name(name) { this.classes.delete(name); }
    get_style() { return this.style; }
    set_style(style) { this.style = style; }
    get_pivot_point() { return this.pivot; }
    set_pivot_point(x, y) { this.pivot = [x, y]; }
    get_transformed_position() { return [this.rect.x, this.rect.y]; }
    get_transformed_size() { return [this.rect.width, this.rect.height]; }
    connect(name, callback) { let id = ++nextId; this.signals.set(id, { name, callback }); return id; }
    disconnect(id) { this.signals.delete(id); }
    emit(name) {
        for (const signal of Array.from(this.signals.values()))
            if (signal.name === name) signal.callback(this);
    }
    get visible() { return this._visible; }
    set visible(value) {
        if (this._visible === value) return;
        this._visible = value;
        this.emit('notify::visible');
    }
    get opacity() { return this._opacity; }
    set opacity(value) {
        if (this._opacity === value) return;
        this._opacity = value;
        this.emit('notify::opacity');
    }
    ease(options) { this.rotation_angle_y = options.rotation_angle_y; this.animations++; }
    remove_transition(name) { assert(['rotation-angle-y', 'opacity'].includes(name)); }
    get_parent() { return this.parent || null; }
    hide() { this.visible = false; }
    show() { this.visible = true; }
}
class Label extends Actor {}
class Icon extends Actor {}
const widgets = ['ClaudeDesktop-System', 'ClaudeDesktop-Processes', 'Desktop_Interactive_Widgets'].map((title, index) => {
    let actor = new Actor({ x: 3000, y: 100 + index * 400, width: 700, height: 350 });
    actor.meta_window = {
        get_title: () => title, get_frame_rect: () => actor.rect,
        get_window_type: () => index === 2 ? 7 : 1,
        can_minimize: () => index === 2,
        minimized: false, minimizes: 0, unminimizes: 0,
        minimize() { this.minimized = true; this.minimizes++; actor.hide(); },
        unminimize() { this.minimized = false; this.unminimizes++; actor.show(); },
    };
    return actor;
});
widgets[0].opacity = 183; // Existing opacity must survive workspace filtering.
let unrelated = new Actor();
unrelated.meta_window = { get_title: () => 'ordinary terminal', get_window_type: () => 0 };
const panelButton = new Actor({ x: 0, y: 0, width: 100, height: 30 });
panelButton.classes.add('panel-button');
const label = new Label();
label.style = 'color: #faf3e5;';
const icon = new Icon();
panelButton.children = [label, icon];
const panelBox = new Actor();
panelBox.children = [panelButton];
const empty = new Actor();
const main = { overview: { visible: false }, panel: { _leftBox: panelBox, _centerBox: empty, _rightBox: empty } };
const monitor = { connect: () => 1, cancel: () => { cancelledMonitor = true; } };
const context = vm.createContext({
    imports: {
        gi: {
            Clutter: { AnimationMode: { EASE_OUT_CUBIC: 1 } },
            Meta: { WindowType: { DESKTOP: 1 } },
            Gio: {
                Settings: function() { return { get_string: () => wallpaper, set_string: (_key, uri) => { wallpaper = uri; } }; },
                File: { new_for_path: () => ({ monitor_directory: () => monitor }),
                        new_for_uri: () => ({ query_exists: () => true }) },
                FileMonitorFlags: { NONE: 0 },
            },
            GLib: {
                get_user_config_dir: () => '/config',
                build_filenamev: parts => parts.join('/'),
                path_get_dirname: name => path.dirname(name),
                file_get_contents: () => [true, Buffer.from(JSON.stringify(config))],
                get_monotonic_time: () => now * 1000,
                timeout_add: (_priority, _ms, callback) => { let id = ++nextId; timers.set(id, callback); return id; },
                source_remove: id => timers.delete(id),
                PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, SOURCE_CONTINUE: true,
            },
            St: { Label, Icon, ThemeContext: { get_for_stage: () => ({ scale_factor: 2 }) } },
        },
        ui: { main },
        misc: { extensionUtils: { getCurrentExtension: () => ({ imports: { logic } }) } },
        byteArray: { toString: bytes => bytes.toString() },
    },
    global: {
        stage: {
            get_key_focus: () => stageFocus,
            connect: (_signal, callback) => { let id = ++nextId; stageHandlers.set(id, callback); return id; },
            disconnect: id => stageHandlers.delete(id),
        },
        display: {
            get focus_window() { return focusWindow; },
            connect: (_signal, callback) => { let id = ++nextId; focusHandlers.set(id, callback); return id; },
            disconnect: id => focusHandlers.delete(id),
        },
        workspace_manager: {
            get_active_workspace_index: () => workspace,
            connect: (_signal, callback) => { let id = ++nextId; handlers.set(id, callback); return id; },
            disconnect: id => handlers.delete(id),
        },
        get_window_actors: () => [...widgets, unrelated],
        get_pointer: () => pointer,
    },
    logError: error => { throw error; },
});
vm.runInContext(fs.readFileSync(path.join(directory, 'extension.js'), 'utf8') + '\nglobalThis.effects = init();', context);
const effects = context.effects;
effects.enable();
assert.equal(wallpaper, 'file:///one.jpg');
assert.equal(effects.describe().widgets, 3);
assert.equal(unrelated.animations, 0);
for (const actor of widgets) assert.equal(actor.rotation_angle_y, -52);

pointer = [3100, 500]; now = 10050; effects._tick();
for (const actor of widgets) assert.equal(actor.rotation_angle_y, 0);
const animations = widgets[0].animations;
effects._tick(); assert.equal(widgets[0].animations, animations, 'steady hover must not restart transitions');
pointer = [100, 500]; now = 10300; effects._tick();
assert.equal(widgets[0].rotation_angle_y, 0, 'brief pointer exit should retain the readable face');
now = 10500; effects._tick();
assert.equal(widgets[0].rotation_angle_y, -52);
pointer = [3100, 500]; effects._tick();
assert.equal(widgets[0].rotation_angle_y, 0);
focusWindow = unrelated.meta_window;
for (const callback of focusHandlers.values()) callback();
assert.equal(widgets[0].rotation_angle_y, -52, 'application focus immediately folds cards, even with the pointer inside');
assert.equal(effects._lastInside, null, 'application focus clears the old desktop hover delay');
effects._tick();
assert.equal(widgets[0].rotation_angle_y, -52, 'hover over an application must never unfold cards');
focusWindow = widgets[2].meta_window; effects._tick();
assert.equal(widgets[0].rotation_angle_y, 0, 'editing a desktop note keeps the cards interactive');
focusWindow = widgets[0].meta_window; effects._tick();
assert.equal(widgets[0].rotation_angle_y, 0, 'desktop window focus allows hover');
focusWindow = null; stageFocus = panelButton; effects._tick();
assert.equal(widgets[0].rotation_angle_y, -52, 'Shell menu focus is not desktop focus');
const desktopGrid = new Actor(); desktopGrid.name = 'DesktopGrid';
stageFocus = desktopGrid;
for (const callback of stageHandlers.values()) callback();
assert.equal(widgets[0].rotation_angle_y, 0, 'Desktop Icons keyboard focus is recognized');
focusWindow = unrelated.meta_window; effects._tick();
assert.equal(widgets[0].rotation_angle_y, -52, 'a stale DesktopGrid key focus cannot override application focus');
focusWindow = null; stageFocus = null;
main.overview.visible = true; effects._tick();
assert.equal(widgets[0].rotation_angle_y, -52, 'overview is not a selected desktop');
main.overview.visible = false;

pointer = [30, 10]; effects._tick();
assert(panelButton.classes.has('claude-readable-hover'));
assert(label.style.includes('color: #241b15'));
// A different panel extension can update inline text colors during the hover.
label.style = 'color: #123456;'; effects._tick();
assert(label.style.includes('color: #241b15'));
pointer = [1000, 500]; effects._tick();
assert(!panelButton.classes.has('claude-readable-hover'));
assert.equal(label.style, 'color: #123456;', 'restore the latest external text style');

workspace = 1; for (const callback of handlers.values()) callback();
assert.equal(wallpaper, 'file:///two.jpg');
workspace = 4; for (const callback of handlers.values()) callback();
assert.equal(wallpaper, 'file:///original.jpg', 'unassigned dynamic workspaces use the original wallpaper');

// An allow-list hides the complete sidebar on entertainment workspaces.
config.sidebarWorkspaces = [1, 3]; effects.reloadConfig();
assert.equal(effects.describe().cardsVisible, false);
for (const actor of widgets) assert.equal(actor.visible, false);
for (const actor of widgets) {
    assert.equal(actor.opacity, 0, 'hidden cards retain a zero-opacity mask between timer ticks');
    actor.show(); // Mutter can show sticky windows again after our workspace handler.
    assert.equal(actor.visible && actor.opacity > 0, false, 'Mutter re-show must not paint a visible frame');
    actor.opacity = 255; // Simulate Shell completing a window effect after re-show.
    actor.show();
    assert.equal(actor.visible && actor.opacity > 0, false, 'Shell opacity resets must not reveal excluded cards');
}
workspace = 1; for (const callback of handlers.values()) callback();
for (const actor of widgets) {
    actor.show();
    assert.equal(actor.visible && actor.opacity > 0, false, 'excluded-to-excluded workspace switches stay hidden');
}
assert.equal(widgets[2].meta_window.minimized, true, 'the invisible GTK notes cannot receive clicks');
assert.equal(widgets[0].meta_window.minimizes, 0, 'desktop-type Conky windows are never minimized');
assert.equal(unrelated.visible, true, 'ordinary applications are not hidden');
const minimized = widgets[2].meta_window.minimizes;
effects._tick(); assert.equal(widgets[2].meta_window.minimizes, minimized, 'do not restart minimization every tick');
workspace = 0; for (const callback of handlers.values()) callback();
assert.equal(effects.describe().cardsVisible, true);
for (const actor of widgets) assert.equal(actor.visible, true);
assert.equal(widgets[0].opacity, 183, 'allowed workspaces restore the original card opacity');
assert.equal(widgets[1].opacity, 255);
assert.equal(widgets[2].meta_window.minimized, false, 'returning to a selected workspace restores the notes');
assert.equal(widgets[2].meta_window.unminimizes, 1);
config.sidebarWorkspaces = []; effects.reloadConfig();
for (const actor of widgets) assert.equal(actor.visible, false, 'empty selection hides on every workspace');
config.sidebarWorkspaces = null; effects.reloadConfig();
workspace = 8; for (const callback of handlers.values()) callback();
for (const actor of widgets) assert.equal(actor.visible, true, 'all-workspaces mode includes newly created workspaces');

// Preserve a window that was already minimized before our filter hid it.
widgets[2].meta_window.minimize();
config.sidebarWorkspaces = []; effects.reloadConfig();
config.sidebarWorkspaces = null; effects.reloadConfig();
assert.equal(widgets[2].meta_window.minimized, true);
assert.equal(widgets[2].visible, false);
widgets[2].meta_window.unminimize();

config.sidebarRestAngle = 60; effects.reloadConfig(); effects._tick();
assert.equal(widgets[0].rotation_angle_y, -60);
config.sidebarWorkspaces = []; effects.reloadConfig();
effects.disable();
assert.equal(wallpaper, 'file:///original.jpg');
assert.equal(timers.size, 0);
assert.equal(handlers.size, 0);
assert.equal(focusHandlers.size, 0);
assert.equal(stageHandlers.size, 0);
assert(cancelledMonitor);
for (const actor of widgets) {
    assert.equal(actor.rotation_angle_y, 0);
    assert.equal(actor.pivot[0], 0.2);
    assert.equal(actor.pivot[1], 0.3);
    assert.equal(actor.signals.size, 0);
    assert.equal(actor.visible, true, 'disable restores hidden card visibility');
    assert.equal(actor.meta_window.minimized, false);
}
assert.equal(widgets[0].opacity, 183, 'disable restores the original card opacity');
for (const actor of widgets) {
    actor.show(); actor.opacity = 201;
    assert.equal(actor.opacity, 201, 'disable removes visibility and opacity guards');
}
const css = fs.readFileSync(path.join(directory, 'stylesheet.css'), 'utf8');
assert(css.includes('background-color: #d97757;'));
console.log('PASS: desktop-only hover, focus loss, widget editing, workspace selection and restoration, wallpapers, orange panel contrast, cleanup');

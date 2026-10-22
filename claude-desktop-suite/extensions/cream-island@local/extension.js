/* GNOME Shell 3.36 native panel Island. One popup overlay; no floating capsule,
 * clock timer, style-change positioning loop, or session-setting modifications. */
const { Clutter, GLib, Meta, Shell, St } = imports.gi;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
let Me, _config, _storage, _timerService, _mediaService, _notifications, _state, _capsule, _panel, _micService;
let _nativeBanners;
let _counters = { geometryRuns: 0, externalBoundsChanges: 0 };
let _cleanup = [], _geometryIdle = null, _renderIdle = null, _clockRestore = null;
const KEYBINDING = 'island-hotkey';
let _keybindingRegistered = false;
function init() { Me = ExtensionUtils.getCurrentExtension(); }
function _connect(object, signal, callback) {
    let id = object.connect(signal, callback);
    _cleanup.push(() => { try { object.disconnect(id); } catch (e) {} });
}
function _locked() { return Boolean(Main.screenShield && Main.screenShield.locked); }
function _privacy() {
    if (!_state) return;
    let locked = _locked();
    _state.privacy(locked, _notifications.dnd);
    if (_capsule) _capsule.container.visible = !locked;
    if (_micService) _micService.setLocked(locked);
    if (locked && _panel) _panel.close(true);
}
function _updateMedia() {
    let snapshot = _mediaService.getSnapshot();
    _state.media(_config.getBoolean('capsule-show-media-ticker', true) ? snapshot.title : '', snapshot.playing);
}
function _appearance() {
    _capsule.updateAppearance();
    let style = Me.imports.modules.appearance.glassStyle(_config.getInt('glass-opacity', 89), true);
    if (_panel.get_style() !== style) _panel.set_style(style);
}
function enable() {
    try {
        _counters = { geometryRuns: 0, externalBoundsChanges: 0 };
        _config = new Me.imports.modules.config.Config(Me);
        _storage = new Me.imports.modules.storage.Storage();
        _timerService = new Me.imports.modules.timerService.TimerService(_storage);
        _mediaService = new Me.imports.modules.mediaService.MediaService();
        _notifications = new Me.imports.modules.notificationService.NotificationService();
        _capsule = new Me.imports.modules.capsule.CapsuleButton(_config);
        // addToStatusArea owns indicator.container. Never reparent the button.
        Main.panel.addToStatusArea('cream-island', _capsule, 0, 'center');
        let dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu && dateMenu.container) {
            _clockRestore = { actor: dateMenu.container, visible: dateMenu.container.visible };
            dateMenu.container.hide(); // One soft hide, no visibility watchdog.
        }
        if (dateMenu && dateMenu._clock) _connect(dateMenu._clock, 'notify::clock', () => _capsule.updateClock());
        _connect(_timerService, 'state-changed', () => _capsule.updateTimer(_timerService.getState()));
        _capsule.updateTimer(_timerService.getState());
        _renderIdle = new Me.imports.modules.runtime.LatestDelivery(
            callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { callback(); return GLib.SOURCE_REMOVE; }),
            id => GLib.source_remove(id), snapshot => { if (_capsule) _capsule.render(snapshot); });
        _state = new Me.imports.modules.islandState.IslandState({
            after: (milliseconds, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
                callback(); return GLib.SOURCE_REMOVE;
            }), cancel: id => GLib.source_remove(id)
        }, snapshot => _renderIdle.push(snapshot));
        _panel = new Me.imports.modules.panel.IslandPanel(_config, _storage, _timerService,
            _capsule, _mediaService, _notifications);
        Main.layoutManager.addTopChrome(_panel, { affectsStruts: false, trackFullscreen: false });
        _micService=new Me.imports.modules.micService.MicService(state=>{_capsule.updateMic(state);if(_panel)_panel.setMicState(state);},value=>{if(_capsule)_capsule.updateLevel(value);});
        _capsule.setPopup(_panel);
        _connect(_capsule,'dismiss-requested',()=>_panel.close());
        _appearance();
        _connect(_capsule, 'open-requested', (button, tab) => _panel.toggle(tab));
        _connect(_panel, 'opened', () => _state.open(true));
        _connect(_panel, 'closed', () => _state.open(false));
        _connect(_panel, 'tab-changed', (panel, tab) => { if (tab === 'notifications') _state.acknowledge(); });
        _cleanup.push(_mediaService.subscribeTicker(() => _updateMedia()));
        _cleanup.push(_notifications.subscribeIncoming(event => {
            _state.notification(event);
            if (_panel._isOpen && _panel._currentTabId === 'notifications') _state.acknowledge();
        }));
        _cleanup.push(_notifications.subscribePrivacy(() => _privacy()));
        _geometryIdle = new Me.imports.modules.runtime.Coalescer(
            callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { callback(); return GLib.SOURCE_REMOVE; }),
            id => GLib.source_remove(id), () => {
                _counters.geometryRuns++;
                if (_capsule.refreshBounds()) {
                    _counters.externalBoundsChanges++;
                    if (_panel._isOpen) _panel._reposition();
                }
            });
        _connect(Main.panel, 'notify::height', () => _geometryIdle.request());
        _connect(Main.panel, 'notify::width', () => _geometryIdle.request());
        [Main.panel._leftBox, Main.panel._rightBox].filter(Boolean).forEach(box =>
            _connect(box, 'notify::width', () => _geometryIdle.request()));
        _connect(Main.layoutManager, 'monitors-changed', () => _geometryIdle.request());
        _connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => {
            _capsule.invalidateTheme(); _panel.invalidateLayoutCache(); _geometryIdle.request();
        });
        if (Main.screenShield) _connect(Main.screenShield, 'locked-changed', () => _privacy());
        _connect(global.window_manager, 'switch-workspace', () => _panel.close());
        _connect(global.window_manager, 'size-change', (wm, actor) => {
            if (_config.getBoolean('auto-hide-fullscreen', true) && actor && actor.meta_window &&
                actor.meta_window.is_fullscreen()) _panel.close();
        });
        let settings = _config.getSettings();
        if (settings) {
            _connect(settings, 'changed::glass-opacity', () => _appearance());
            _connect(settings, 'changed::capsule-show-media-ticker', () => _updateMedia());
            Main.wm.addKeybinding(KEYBINDING, settings, Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL, () => _capsule._setHover(true));
            _keybindingRegistered = true;
        }
        _privacy();
        _geometryIdle.request();
        _mediaService.start().catch(error => log('[CreamIsland] media discovery: ' + error));
        // Install last: native banners remain available if Island setup fails.
        _nativeBanners = new Me.imports.modules.notificationService.NativeBannerSuppressor(Main.messageTray);
    } catch (e) {
        log('[CreamIsland] enable: ' + e);
        try { disable(); } catch (cleanupError) { log('[CreamIsland] cleanup: ' + cleanupError); }
        throw e; // Shell must report ERROR, not a silently disabled ENABLED state.
    }
}
function disable() {
    if (_nativeBanners) { _nativeBanners.destroy(); _nativeBanners = null; }
    if(_micService){_micService.destroy();_micService=null;}
    if (_keybindingRegistered) {
        _keybindingRegistered = false;
        try { Main.wm.removeKeybinding(KEYBINDING); } catch (e) {}
    }
    _cleanup.reverse().forEach(callback => { try { callback(); } catch (e) {} }); _cleanup = [];
    if (_geometryIdle) { _geometryIdle.destroy(); _geometryIdle = null; }
    if (_renderIdle) { _renderIdle.destroy(); _renderIdle = null; }
    if (_state) { _state.destroy(); _state = null; }
    if (_panel) { Main.layoutManager.removeChrome(_panel); _panel.destroy(); _panel = null; }
    if (_mediaService) { _mediaService.destroy(); _mediaService = null; }
    if (_notifications) { _notifications.destroy(); _notifications = null; }
    if (_timerService) { _timerService.destroy(); _timerService = null; }
    if (_capsule) { _capsule.destroy(); _capsule = null; }
    if (_clockRestore) {
        try { _clockRestore.actor.visible = _clockRestore.visible; } catch (e) {}
        _clockRestore = null;
    }
    _config = null; _storage = null;
}
// Read-only inspection of the actual installed/native allocation.
function getLayoutDiagnostics() {
    if (!_capsule) return { error: 'disabled' };
    function rect(actor) {
        let [x, y] = actor.get_transformed_position();
        let [width, height] = actor.get_transformed_size();
        return { x: x, y: y, width: width, height: height };
    }
    let state = _state.snapshot();
    return { state: { mode: state.mode, playing: state.playing, unread: state.unread }, nativeContainer: rect(_capsule.container),
        surface: rect(_capsule._surface), panelBar: rect(Main.panel),
        panel: _panel.visible ? rect(_panel) : null,
        viewport: _panel.visible ? rect(_panel._scrollView) : null };
}

function getPerformanceDiagnostics() {
    if (!_capsule || !_state) return { available: false };
    return { available: true, counters: Object.assign({}, _counters),
        dock: _capsule.getDiagnostics(), popup: _panel.getDiagnostics(),
        media: _mediaService.getDiagnostics(), layout: getLayoutDiagnostics() };
}

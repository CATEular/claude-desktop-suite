const { Clutter, Gio, GLib, Meta, St } = imports.gi;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const ByteArray = imports.byteArray;
const Me = ExtensionUtils.getCurrentExtension();
const Logic = Me.imports.logic;

class DesktopEffects {
    enable() {
        this._enabled = true;
        this._tracked = new Map();
        this._panelHover = new Map();
        this._expanded = false;
        this._lastInside = null;
        this._lastScan = 0;
        this._reloadId = 0;
        this._background = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        this._originalWallpaper = this._background.get_string('picture-uri');
        this._configPath = GLib.build_filenamev([GLib.get_user_config_dir(), 'claude-desktop-effects', 'settings.json']);
        this._config = Logic.normalizeConfig({});
        this.reloadConfig();
        this._workspaceSignal = global.workspace_manager.connect('active-workspace-changed', () => {
            this._lastInside = null;
            this._applyWallpaper();
            this._tick();
        });
        this._focusSignal = global.display.connect('notify::focus-window', () => this._tick());
        this._stageFocusSignal = global.stage.connect('notify::key-focus', () => this._tick());
        let directory = Gio.File.new_for_path(GLib.path_get_dirname(this._configPath));
        this._monitor = directory.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_monitor, file, otherFile) => {
            if (file.get_basename() !== 'settings.json' &&
                (!otherFile || otherFile.get_basename() !== 'settings.json'))
                return;
            if (this._reloadId)
                GLib.source_remove(this._reloadId);
            this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
                this._reloadId = 0;
                this.reloadConfig();
                return GLib.SOURCE_REMOVE;
            });
        });
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            try {
                this._tick();
            } catch (error) {
                logError(error, 'Claude Desktop Effects');
            }
            return GLib.SOURCE_CONTINUE;
        });
        this._tick();
    }

    reloadConfig() {
        try {
            let [ok, bytes] = GLib.file_get_contents(this._configPath);
            if (ok)
                this._config = Logic.normalizeConfig(JSON.parse(ByteArray.toString(bytes)));
        } catch (error) {
            logError(error, 'Keeping the last valid desktop-effects configuration');
        }
        this._applyWallpaper();
        if (this._tracked)
            this._setExpanded(this._expanded, true);
        if (!this._config.topbarHoverEnabled && this._panelHover)
            this._clearPanelHover();
        if (this._tracked)
            this._tick();
    }

    _applyWallpaper() {
        if (!this._background || !this._config.workspaceWallpapersEnabled)
            return;
        let index = global.workspace_manager.get_active_workspace_index();
        let uri = Logic.wallpaperForWorkspace(this._config, index, this._originalWallpaper);
        if (!uri || uri === this._background.get_string('picture-uri'))
            return;
        try {
            if (Gio.File.new_for_uri(uri).query_exists(null))
                this._background.set_string('picture-uri', uri);
        } catch (error) {
            logError(error, 'Workspace wallpaper unavailable');
        }
    }

    _scanWindows() {
        for (let actor of global.get_window_actors()) {
            if (this._tracked.has(actor) || !actor.meta_window ||
                !Logic.isDesktopWidget(actor.meta_window.get_title()))
                continue;
            let [pivotX, pivotY] = actor.get_pivot_point();
            let record = { pivotX, pivotY, rotation: actor.rotation_angle_y,
                hiddenByUs: false, minimizedByUs: false, wasVisible: false,
                opacity: actor.opacity };
            record.destroyId = actor.connect('destroy', () => this._tracked.delete(actor));
            // Mutter may re-show sticky actors after active-workspace-changed.
            // Enforce the mask synchronously, before the next frame is painted.
            let guard = () => {
                if (this._enabled && (record.hiddenByUs || !Logic.sidebarOnWorkspace(
                    this._config, global.workspace_manager.get_active_workspace_index())))
                    this._hideActor(actor, record);
            };
            record.visibleId = actor.connect('notify::visible', guard);
            record.opacityId = actor.connect('notify::opacity', guard);
            this._tracked.set(actor, record);
            actor.set_pivot_point(1, 0.5);
            this._animateActor(actor, this._expanded);
        }
    }

    _animateActor(actor, expanded) {
        let angle = expanded || !this._config.sidebarHoverEnabled ? 0 : -this._config.sidebarRestAngle;
        actor.ease({ rotation_angle_y: angle, duration: this._config.animationDuration,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
    }

    _setExpanded(expanded, force) {
        if (!force && expanded === this._expanded)
            return;
        this._expanded = expanded;
        for (let actor of this._tracked.keys())
            this._animateActor(actor, expanded);
    }

    _desktopHasFocus() {
        if (Main.overview.visible)
            return false;
        let focused = global.display.focus_window;
        if (focused)
            return focused.get_window_type() === Meta.WindowType.DESKTOP ||
                Logic.isDesktopWidget(focused.get_title());
        // Desktop Icons puts keyboard focus on a Shell actor rather than a
        // Meta.Window. Do not mistake a panel menu or another Shell UI for it.
        let keyFocus = global.stage.get_key_focus();
        for (let actor = keyFocus; actor; actor = actor.get_parent()) {
            if (actor.name === 'DesktopGrid' ||
                (Main.layoutManager && actor === Main.layoutManager._backgroundGroup))
                return true;
        }
        return !keyFocus || keyFocus === global.stage;
    }

    _restoreVisibility(actor, record) {
        if (!record.hiddenByUs)
            return;
        let restoreVisible = record.wasVisible || record.minimizedByUs;
        record.hiddenByUs = false;
        if (record.minimizedByUs && actor.meta_window) {
            record.minimizedByUs = false;
            actor.meta_window.unminimize();
        }
        actor.opacity = record.opacity;
        if (restoreVisible)
            actor.show();
    }

    _hideActor(actor, record) {
        let firstHide = !record.hiddenByUs;
        if (firstHide) {
            record.hiddenByUs = true;
            record.wasVisible = actor.visible;
            record.opacity = actor.opacity;
        }
        // visible=false alone is overwritten by workspace transitions. A
        // persistent opacity mask also covers the gap before the next poll.
        if (actor.opacity !== 0) {
            actor.remove_transition('opacity');
            actor.opacity = 0;
        }
        let window = actor.meta_window;
        // GTK notes must also stop receiving clicks. Conky DESKTOP windows
        // cannot minimize, so keep their compositor actors hidden instead.
        if (firstHide && window && window.can_minimize() && !window.minimized) {
            record.minimizedByUs = true;
            window.minimize();
        }
        if (actor.visible)
            actor.hide();
    }

    _updateVisibility(show) {
        for (let [actor, record] of this._tracked) {
            if (show) {
                this._restoreVisibility(actor, record);
                continue;
            }
            this._hideActor(actor, record);
        }
    }

    _tick() {
        let now = GLib.get_monotonic_time() / 1000;
        if (now - this._lastScan > 700) {
            this._scanWindows();
            this._lastScan = now;
        }
        let show = Logic.sidebarOnWorkspace(this._config,
            global.workspace_manager.get_active_workspace_index());
        this._updateVisibility(show);
        let [x, y] = global.get_pointer();
        let rects = [];
        for (let actor of this._tracked.keys()) {
            if (actor.meta_window && actor.visible)
                rects.push(actor.meta_window.get_frame_rect());
        }
        let scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let inside = Logic.containsPoint(Logic.unionRect(rects), x, y,
            this._config.sidebarHoverPadding * scale);
        let desktopFocused = show && this._desktopHasFocus();
        if (!desktopFocused)
            this._lastInside = null;
        else if (inside)
            this._lastInside = now;
        let front = show && (!this._config.sidebarHoverEnabled || (desktopFocused &&
            Logic.shouldExpand(inside, now, this._lastInside, this._config.sidebarCloseDelay)));
        this._setExpanded(front, false);
        this._updatePanel(x, y);
    }

    _panelButtons() {
        let result = [];
        let visit = actor => {
            if (actor.has_style_class_name && actor.has_style_class_name('panel-button')) {
                result.push(actor);
                return;
            }
            if (actor.get_children)
                actor.get_children().forEach(visit);
        };
        for (let box of [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox])
            visit(box);
        return result;
    }

    _updatePanel(x, y) {
        if (!this._config.topbarHoverEnabled) {
            this._clearPanelHover();
            return;
        }
        let active = new Set();
        for (let button of this._panelButtons()) {
            if (!button.visible)
                continue;
            let [left, top] = button.get_transformed_position();
            let [width, height] = button.get_transformed_size();
            if (!Logic.containsPoint({ x: left, y: top, width, height }, x, y, 0))
                continue;
            active.add(button);
            let styles = this._panelHover.get(button) || new Map();
            let darken = actor => {
                if (actor instanceof St.Label || actor instanceof St.Icon) {
                    let current = actor.get_style();
                    let original = styles.has(actor) ? styles.get(actor) : current;
                    let desired = (original || '') + '; color: #241b15; text-shadow: none;';
                    if (styles.has(actor) && current !== desired) {
                        original = current;
                        desired = (original || '') + '; color: #241b15; text-shadow: none;';
                    }
                    styles.set(actor, original);
                    if (current !== desired)
                        actor.set_style(desired);
                }
                if (actor.get_children)
                    actor.get_children().forEach(darken);
            };
            darken(button);
            button.add_style_class_name('claude-readable-hover');
            this._panelHover.set(button, styles);
        }
        for (let button of Array.from(this._panelHover.keys())) {
            if (!active.has(button))
                this._restorePanelButton(button);
        }
    }

    _restorePanelButton(button) {
        let styles = this._panelHover.get(button);
        if (!styles)
            return;
        for (let [actor, original] of styles) {
            try { actor.set_style(original); } catch (error) { /* actor was removed */ }
        }
        try { button.remove_style_class_name('claude-readable-hover'); } catch (error) { /* removed */ }
        this._panelHover.delete(button);
    }

    _clearPanelHover() {
        for (let button of Array.from(this._panelHover.keys()))
            this._restorePanelButton(button);
    }

    describe() {
        return { revision: 3, enabled: this._enabled, widgets: this._tracked.size,
            expanded: this._expanded, restAngle: this._config.sidebarRestAngle,
            workspace: global.workspace_manager.get_active_workspace_index() + 1,
            cardsVisible: Logic.sidebarOnWorkspace(this._config,
                global.workspace_manager.get_active_workspace_index()),
            sidebarWorkspaces: this._config.sidebarWorkspaces,
            wallpaperSlots: this._config.wallpapers.length };
    }

    disable() {
        this._enabled = false;
        if (this._timerId) GLib.source_remove(this._timerId);
        if (this._reloadId) GLib.source_remove(this._reloadId);
        if (this._workspaceSignal) global.workspace_manager.disconnect(this._workspaceSignal);
        if (this._focusSignal) global.display.disconnect(this._focusSignal);
        if (this._stageFocusSignal) global.stage.disconnect(this._stageFocusSignal);
        if (this._monitor) this._monitor.cancel();
        this._clearPanelHover();
        for (let [actor, record] of this._tracked) {
            actor.disconnect(record.destroyId);
            actor.disconnect(record.visibleId);
            actor.disconnect(record.opacityId);
            actor.remove_transition('rotation-angle-y');
            actor.rotation_angle_y = record.rotation;
            actor.set_pivot_point(record.pivotX, record.pivotY);
            this._restoreVisibility(actor, record);
        }
        this._tracked.clear();
        if (this._background && this._originalWallpaper)
            this._background.set_string('picture-uri', this._originalWallpaper);
    }
}

function init() {
    return new DesktopEffects();
}

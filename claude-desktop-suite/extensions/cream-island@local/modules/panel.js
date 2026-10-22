/* modules/panel.js
 * Dropdown Island floating panel overlaying windows without modifying workspace height.
 * Styled with Apple-like black/white translucent glass.
 * Handles modality, Esc to close, outside clicks, tab switching, and animation concurrency guards.
 * Uses a screen-clamped stable viewport; page content scrolls without recursive measurement.
 */

const { Clutter, GLib, GObject, St } = imports.gi;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension() || imports.ui.main.extensionManager.lookup('cream-island@local');
const Layout = Me.imports.modules.layout;
const Runtime = Me.imports.modules.runtime;
const PageFlow = Me.imports.modules.pageFlow.PageFlow;
const Launcher = Me.imports.modules.launcher;
const ControlCenter = Me.imports.modules.controlCenterView;

const TimerView = Me.imports.modules.timerView;
const MediaView = Me.imports.modules.mediaView;
const NotificationCenterView = Me.imports.modules.notificationCenterView;
const WorkspacesView = Me.imports.modules.workspacesView;
const WallpaperView = Me.imports.modules.wallpaperView;
const PowerView = Me.imports.modules.powerView;

var IslandPanel = GObject.registerClass({
    Signals: {
        'closed': {},
        'opened': {},
        'tab-changed': { param_types: [GObject.TYPE_STRING] }
    }
}, class IslandPanel extends St.BoxLayout {
    _init(config, storage, timerService, capsule, mediaService, notificationService) {
        super._init({
            vertical: true,
            style_class: 'cream-island-panel',
            reactive: true,
            can_focus: true,
            visible: false
        });

        this._config = config;
        this._storage = storage;
        this._timerService = timerService;
        this._capsule = capsule || null;
        this._mediaService = mediaService;
        this._notificationService = notificationService;
        this._motion = new Runtime.TransitionGuard(this);

        this._isOpen = false;
        this._modalPushed = false;
        this._stageEventId = 0;
        this._currentTabId = 'notifications';
        this._currentView = null;
        this._tabButtons = new Map();
        this._views = new Map();

        this._buildHeaderTabs();
        this._buildContentArea();
        this._stats = { shellOpens: 0, shellCloses: 0, measurements: 0, preferredMeasurements: 0 };
        this._heightCache = new Map(); this._headerCache = null;
        this._flow = new PageFlow({
            cached: id => this._views.get(id) || null,
            build: id => {
                try { let start = GLib.get_monotonic_time(); let view = this._getView(id);
                    this._stats.lastBuildMs = (GLib.get_monotonic_time() - start) / 1000;
                    this._stats.maxBuildMs = Math.max(this._stats.maxBuildMs || 0, this._stats.lastBuildMs); return view; }
                catch (error) { let view = this._buildErrorView(id, error); this._views.set(id, view); return view; }
            },
            present: (view, id) => this._presentView(view, id),
            activate: (view, active) => { if (view.setActive) view.setActive(active); },
            cleanup: view => { if (view.cleanupHidden) view.cleanupHidden(); },
            measure: () => this._reposition(),
            openShell: () => this._openShell(), closeShell: immediate => this._closeShell(immediate)
        }, {
            schedule: callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { callback(); return GLib.SOURCE_REMOVE; }),
            cancel: id => GLib.source_remove(id)
        }, Runtime);


        // Safe GObject signal key handler (Esc to close)
        this.connect('key-press-event', (actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Safe GObject signal click handler (consume clicks inside panel)
        this.connect('button-press-event', () => {
            return Clutter.EVENT_STOP;
        });
    }

    setCapsule(capsule) {
        this._capsule = capsule;
    }

    _buildHeaderTabs() {
        this._headerRow = new St.BoxLayout({ vertical: true, style_class: 'cream-island-header' });
        this.add_child(this._headerRow);
        let top = new St.BoxLayout({ style_class: 'cream-island-panel-title-row' });
        this._clockLabel = new St.Label({ style_class: 'cream-island-panel-clock',
            y_align: Clutter.ActorAlign.CENTER, x_expand: true });
        top.add_child(this._clockLabel);
        let close = new St.Button({ style_class: 'cream-island-panel-close', accessible_name: '关闭', can_focus: true });
        close.set_child(new St.Icon({ icon_name: 'window-close-symbolic', style_class: 'cream-island-tab-icon' }));
        close.connect('clicked', () => this.close()); top.add_child(close);
        this._headerRow.add_child(top);
        this._navLayout = new Clutter.GridLayout({ column_homogeneous: true, row_homogeneous: true });
        this._navBox = new St.Widget({ layout_manager: this._navLayout, x_expand: true });
        this._headerRow.add_child(this._navBox);
        this._tooltip = new St.Label({ style_class: 'cream-island-tooltip', visible: false, reactive: false });
        Main.uiGroup.add_child(this._tooltip);
        let tabs = [
            ['control-center', '控制中心', 'preferences-system-symbolic'],
            ['timer', '计时器', 'alarm-symbolic'], ['media', '哔哩哔哩', 'video-x-generic-symbolic'],
            ['notifications', '通知', 'notifications-symbolic'], ['workspaces', '工作区', 'view-dual-symbolic'],
            ['wallpaper', '壁纸', 'preferences-desktop-wallpaper-symbolic'],
            ['power', '电源', 'system-shutdown-symbolic'], ['launcher', '应用', 'view-grid-symbolic']
        ];
        tabs.forEach(([id, title, icon]) => {
            let button = new St.Button({ style_class: 'cream-island-tab-btn', accessible_name: title,
                can_focus: true, track_hover: true, x_expand: true });
            button.set_child(new St.Icon({ icon_name: icon, style_class: 'cream-island-tab-icon' }));
            button.connect('notify::hover', () => {
                if (!button.hover || !this._isOpen) { this._tooltip.hide(); return; }
                this._tooltip.text = title;
                let [x, y] = button.get_transformed_position();
                this._tooltip.set_position(x, y + button.height + 4);
                this._tooltip.show();
            });
            button.connect('clicked', () => { this._tooltip.hide(); this.switchTab(id); });
            this._tabButtons.set(id, button);
        });
        this._arrangeTabs(8);
    }

    _arrangeTabs(columns) {
        if (columns === this._navColumns) return;
        this._navColumns = columns;
        this._navBox.remove_all_children();
        Array.from(this._tabButtons.values()).forEach((button, index) =>
            this._navLayout.attach(button, index % columns, Math.floor(index / columns), 1, 1));
    }

    _buildContentArea() {
        this._scrollView = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.AUTOMATIC,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true
        });

        this._contentBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: false
        });
        this._scrollView.add_actor(this._contentBox);
        this.add_child(this._scrollView);


    }

    _getView(tabId) {
        if (this._views.has(tabId)) {
            return this._views.get(tabId);
        }

        let view = null;
        if (tabId === 'control-center') {
            view = new ControlCenter.ControlCenterView();
        } else if (tabId === 'media') {
            view = new MediaView.MediaView(this._mediaService);
        } else if (tabId === 'timer') {
            view = new TimerView.TimerView(this._timerService);
        } else if (tabId === 'notifications') {
            view = new NotificationCenterView.NotificationCenterView(this._notificationService);
        } else if (tabId === 'workspaces') {
            view = new WorkspacesView.WorkspacesView();
            view.connect('workspace-switched', () => this.close());
            view.connect('layout-ready', () => { this._heightCache.delete(view); this._flow.ready(view); });
        } else if (tabId === 'wallpaper') {
            view = new WallpaperView.WallpaperView(this._config);
        } else if (tabId === 'power') {
            view = new PowerView.PowerView();
        } else if (tabId === 'launcher') {
            view = new Launcher.AppLauncherView();
            view.connect('app-launched', () => this.close());
        }

        if (view) {
            this._views.set(tabId, view);
        }
        return view;
    }

    _buildErrorView(tabId, err) {
        let box = new St.BoxLayout({
            vertical: true,
            style_class: 'cream-island-card',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'padding: 40px;'
        });

        let errTitle = new St.Label({
            text: '加载模块失败: ' + tabId,
            style_class: 'cream-island-title',
            margin_bottom: 8
        });
        box.add_child(errTitle);

        let errMsg = new St.Label({
            text: String(err),
            style_class: 'cream-island-subtitle',
            margin_bottom: 16
        });
        box.add_child(errMsg);

        let retryBtn = new St.Button({
            label: '重试加载',
            style_class: 'cream-island-btn-accent'
        });
        retryBtn.connect('clicked', () => {
            this._views.delete(tabId);
            this.switchTab(tabId);
        });
        box.add_child(retryBtn);

        return box;
    }

    setMicState(state){this._micState=state;let view=this._views.get('notifications');if(view)view.setMicState(state);}
    switchTab(tabId) { this._flow.switch(tabId); }

    _presentView(view, tabId) {
        this._currentTabId = tabId;
        let button=this._tabButtons.get(tabId);this._clockLabel.text=button?button.accessible_name:'功能';
        this._tabButtons.forEach((button, id) => {
            if (id === tabId) button.add_style_class_name('active');
            else button.remove_style_class_name('active');
        });
        if (this._currentView !== view) {
            if (this._currentView && this._currentView.get_parent() === this._contentBox)
                this._contentBox.remove_child(this._currentView);
            this._currentView = view;
            if (view.get_parent() !== this._contentBox) this._contentBox.add_child(view);
        }
        if(tabId==='notifications'&&this._micState)view.setMicState(this._micState);
        view.show(); this.emit('tab-changed', tabId);
    }

    _positionShell(height) {
        let monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        let scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._anchorBottom = Main.panel.get_transformed_position()[1] + Main.panel.height;
        let geometry = Layout.panelGeometry(monitor, scale, this._anchorBottom, height);
        this.width = geometry.width; this.height = geometry.height;
        let anchorX = this._capsule ? this._capsule.get_transformed_position()[0] + this._capsule.width / 2 :
            monitor.x + monitor.width / 2;
        this.x = Math.max(monitor.x + 16 * scale,
            Math.min(anchorX - geometry.width / 2, monitor.x + monitor.width - 16 * scale - geometry.width));
        this.y = geometry.y;
    }

    _reposition() {
        if (!this._isOpen) return;
        this._stats.measurements++;
        let monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        let scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._positionShell(480 * scale);
        let panelW = this.width;

        // Stable viewport: page content scrolls. Never synchronously walk the
        // complete child tree for preferred heights on clicks or ready signals.
        let contentWidth = this.get_theme_node().adjust_for_width(panelW);
        this._arrangeTabs(contentWidth < 320 * scale ? 4 : 8);
        if (this._currentView && this._currentView.setAvailableWidth)
            this._currentView.setAvailableWidth(contentWidth);
    }

    open(targetTab) {
        if (Main.screenShield && Main.screenShield.locked) return;
        this._flow.open(targetTab || this._currentTabId || 'notifications');
    }

    _openShell() {
        this._stats.shellOpens++;
        if (Main.screenShield && Main.screenShield.locked) return;
        let token = this._motion.begin();
        this._clockLabel.text = '功能';
        this.remove_transition('opacity');
        this.remove_transition('translation_y');

        this._isOpen = true;
        this.emit('opened');
        let scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._positionShell(480 * scale);

        this.opacity = 255;
        this.translation_y = -4;
        this.show();

        this.ease({
            translation_y: 0,
            duration: St.Settings.get().enable_animations ? 100 : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });


        if (!this._modalPushed) this._modalPushed=Boolean(Main.pushModal(this));
        // Outside click handler via stage captured-event
        if (!this._stageEventId) {
            this._stageEventId = global.stage.connect('captured-event', (stage, event) => {
                if (event.type() === Clutter.EventType.BUTTON_PRESS) {
                    let [x, y] = event.get_coords();
                    let [panelX, panelY] = this.get_transformed_position();
                    let [panelW, panelH] = this.get_transformed_size();

                    // If click occurred on the capsule, allow capsule's own click listener to toggle
                    if (this._capsule) {
                        let surface = this._capsule._surface || this._capsule;
                        let [cx, cy] = surface.get_transformed_position();
                        let [cw, ch] = surface.get_transformed_size();
                        if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) {
                            return Clutter.EVENT_PROPAGATE;
                        }
                    }

                    if (x < panelX || x > panelX + panelW || y < panelY || y > panelY + panelH) {
                        this.close();
                    }
                }
                return Clutter.EVENT_PROPAGATE;
            });
        }

        this.grab_key_focus();
    }

    close(immediate) {
        if (this._isOpen) this._flow.close(immediate);
        else if (immediate) this._closeShell(true);
    }

    _closeShell(immediate) {
        this._stats.shellCloses++;
        if(this._capsule&&this._capsule.collapse)this._capsule.collapse();
        if (!this._isOpen) {
            if (immediate) { this._motion.begin(); this.opacity = 0; this.hide(); this._tooltip.hide(); }
            return;
        }
        let token = this._motion.begin();
        this._isOpen = false;
        this._tooltip.hide();
        this.emit('closed');

        if (this._stageEventId) {
            global.stage.disconnect(this._stageEventId);
            this._stageEventId = 0;
        }

        if (this._modalPushed) {
            Main.popModal(this);
            this._modalPushed = false;
        }

        this.remove_transition('opacity');
        this.remove_transition('translation_y');

        this.ease({
            translation_y: -6,
            duration: !immediate && St.Settings.get().enable_animations ? 90 : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._motion.current(token) && !this._isOpen) this.hide();
            }
        });
    }

    toggle(targetTab) {
        if (this._isOpen) {
            if (targetTab && targetTab !== this._currentTabId) {
                this.switchTab(targetTab);
            } else {
                this.close();
            }
        } else {
            this.open(targetTab);
        }
    }

    invalidateLayoutCache() { this._heightCache.clear(); this._headerCache = null; }

    getDiagnostics() {
        return { popup: Object.assign({}, this._stats), pages: Object.assign({}, this._flow.stats),
            workspace: this._views.has('workspaces') ? this._views.get('workspaces').getDiagnostics() : null };
    }

    destroy() {
        this._flow.destroy();
        this._motion.destroy();
        this._tooltip.destroy();
        if (this._stageEventId) {
            global.stage.disconnect(this._stageEventId);
            this._stageEventId = 0;
        }
        if (this._modalPushed) {
            Main.popModal(this);
            this._modalPushed = false;
        }

        this._views.forEach(v => {
            try {
                v.destroy();
            } catch (e) {}
        });
        this._views.clear();

        super.destroy();
    }
});

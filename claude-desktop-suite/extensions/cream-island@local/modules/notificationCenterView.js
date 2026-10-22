/* Visible-only history UI; NotificationService retains source connections. */
const { Clutter, GLib, GObject, St } = imports.gi;
const Runtime = imports.misc.extensionUtils.getCurrentExtension().imports.modules.runtime;
const Batch = imports.misc.extensionUtils.getCurrentExtension().imports.modules.batch.Batch;
var NotificationCenterView = GObject.registerClass(class NotificationCenterView extends St.BoxLayout {
    _init(service) {
        super._init({ vertical: true, style_class: 'cream-island-card' });
        this._service = service; this._active = false;this._dirty=true;
        this._refresh = new Runtime.Coalescer(
            callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { callback(); return GLib.SOURCE_REMOVE; }),
            id => GLib.source_remove(id), () => this._loadNotifications());
        this._batch = new Batch(cb=>GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,()=>{cb();return GLib.SOURCE_REMOVE;}),id=>GLib.source_remove(id),6);
        this._buildUI();
        this._unsubscribe = service.subscribe(() => {this._dirty=true; if (this._active) this._refresh.request(); });
    }
    _buildUI() {
        // Header
        let headerRow = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });
        let title = new St.Label({
            text: '通知中心',
            style_class: 'cream-island-title',
            x_expand: true
        });
        headerRow.add_child(title);

        this._dndBtn = new St.Button({
            label: '勿扰模式',
            style_class: 'cream-island-btn'
        });
        this._dndBtn.connect('clicked', () => this._toggleDnd());
        headerRow.add_child(this._dndBtn);

        let clearAllBtn = new St.Button({
            label: '清空全部',
            style_class: 'cream-island-btn cream-island-btn-danger'
        });
        clearAllBtn.connect('clicked', () => this._clearAllNotifications());
        headerRow.add_child(clearAllBtn);

        this.add_child(headerRow);

        this._micStatus=new St.Label({text:'麦克风：无录音会话',style_class:'cream-island-subtitle'});
        this.add_child(this._micStatus);
        // Notifications Scroll Area
        this._scrollView = new St.ScrollView({
            style_class: 'cream-island-card',
            x_expand: true,
            y_expand: true
        });
        this._notifListBox = new St.BoxLayout({
            vertical: true
        });
        this._scrollView.add_actor(this._notifListBox);
        this.add_child(this._scrollView);

        // Empty state
        this._emptyLabel = new St.Label({
            text: '🎉 没有未读通知',
            style_class: 'cream-island-subtitle',
            x_align: Clutter.ActorAlign.CENTER,
            visible: false
        });
        this.add_child(this._emptyLabel);

        this._updateDndState();
    }


    setActive(active) {
        this._active = active; if(!active)this._batch.stop();
        if (active&&this._dirty) this._refresh.request();
    }
    setMicState(state) {this._micStatus.text=state.active ? (state.muted?'麦克风：录音会话 · 输入已静音':(state.levelAvailable?'麦克风：录音会话 · 默认输入实时峰值':'麦克风：录音会话 · 电平暂不可用')):'麦克风：无录音会话';}
    _updateDndState() { this._dndBtn.label = this._service.dnd ? '勿扰运行中' : '开启勿扰'; }
    _toggleDnd() { this._service.setDnd(!this._service.dnd); this._updateDndState(); }
    _loadNotifications() {
        if (!this._active) return;
        this._updateDndState();
        this._batch.stop(); this._notifListBox.destroy_all_children();
        let history = this._service.history();
        this._batch.run(history, item => this._notifListBox.add_child(this._createNotificationItem(item.source, item.notification)),()=>{this._dirty=false;});
        this._emptyLabel.visible = history.length === 0;
        this._scrollView.visible = history.length > 0;
    }
    _createNotificationItem(source, notif) {
        let itemBox = new St.BoxLayout({
            vertical: true,
            style_class: 'cream-island-notif-item'
        });

        // Top line: App name + Close button
        let topRow = new St.BoxLayout({ vertical: false });
        let sourceTitle = new St.Label({
            text: source.title || '系统通知',
            style_class: 'cream-island-subtitle',
            x_expand: true
        });
        topRow.add_child(sourceTitle);

        let closeBtn = new St.Button({
            label: '✕',
            style_class: 'cream-island-btn'
        });
        closeBtn.connect('clicked', () => {
            try {
                notif.destroy();
            } catch (e) {}
        });
        topRow.add_child(closeBtn);
        itemBox.add_child(topRow);

        // Title
        let notifTitle = new St.Label({
            text: notif.title || '通知',
            style_class: 'cream-island-notif-title'
        });
        itemBox.add_child(notifTitle);

        // Body
        if (notif.bannerBodyText) {
            let bodyLabel = new St.Label({
                text: notif.bannerBodyText,
                style_class: 'cream-island-notif-body'
            });
            itemBox.add_child(bodyLabel);
        }

        // Action buttons (if any)
        if (notif.actions && notif.actions.length > 0) {
            let actionRow = new St.BoxLayout({ vertical: false, margin_top: 4 });
            notif.actions.forEach(action => {
                let actionBtn = new St.Button({
                    label: action.label || '查看',
                    style_class: 'cream-island-btn-accent'
                });
                actionBtn.connect('clicked', () => {
                    try {
                        if (typeof action.callback === 'function') {
                            action.callback();
                        } else if (typeof notif.activate === 'function') {
                            notif.activate();
                        }
                    } catch (e) {}
                });
                actionRow.add_child(actionBtn);
            });
            itemBox.add_child(actionRow);
        }

        return itemBox;
    }


    _clearAllNotifications() { this._service.clear(); }
    destroy() { this._batch.destroy();
        this._active = false; this._refresh.destroy(); this._unsubscribe(); super.destroy();
    }
});

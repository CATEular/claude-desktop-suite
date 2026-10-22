/* Lightweight, long-lived source subscriptions. History UI is not constructed
 * here. notification-added counts; notification-show may show the same ID once. */
const { Gio, GLib, GObject } = imports.gi;
const Runtime = (() => { try { return imports.misc.extensionUtils.getCurrentExtension().imports.modules.runtime; }
    catch (e) { return imports.modules.runtime; } })();

/* Block only MessageTray's own Source handler. Island subscriptions, history,
 * application policy and the user's DND setting remain intact. The handler ID
 * is part of the installed GNOME Shell 3.36 MessageTray source record. */
var NativeBannerSuppressor = class NativeBannerSuppressor {
    constructor(tray) {
        if (!tray || !(tray._sources instanceof Map) || typeof tray.getSources !== 'function')
            throw new Error('Unsupported GNOME MessageTray source API');
        this._tray = tray;
        this._dead = false;
        this._sources = new Map();
        this._signals = [];
        try {
            this._signals.push(tray.connect('source-added', (_tray, source) => this._track(source)));
            this._signals.push(tray.connect('source-removed', (_tray, source) => this._release(source)));
            tray.getSources().forEach(source => this._track(source));
            // Close an already visible banner through Shell's normal cleanup.
            if (tray._notification) {
                tray._updateNotificationTimeout(0);
                tray._hideNotification(false);
            }
            // Existing queued notifications remain in their Source history.
            while (tray._notificationQueue.length) {
                let notification = tray._notificationQueue.shift();
                tray.emit('queue-changed');
                notification.playSound();
            }
        } catch (error) {
            this.destroy();
            throw error;
        }
    }
    _track(source) {
        if (this._dead || this._sources.has(source)) return;
        let native = this._tray._sources.get(source);
        if (!native || !native.showId || !GObject.signal_handler_is_connected(source, native.showId))
            throw new Error('Unsupported GNOME MessageTray notification handler');
        GObject.signal_handler_block(source, native.showId);
        let record = { nativeId: native.showId, soundId: 0 };
        this._sources.set(source, record);
        // Preserve policy-controlled notification sound without creating a banner.
        record.soundId = source.connect('notification-show', (_source, notification) => notification.playSound());
    }
    _release(source) {
        let record = this._sources.get(source);
        if (!record) return;
        this._sources.delete(source);
        if (record.soundId && GObject.signal_handler_is_connected(source, record.soundId))
            source.disconnect(record.soundId);
        if (GObject.signal_handler_is_connected(source, record.nativeId))
            GObject.signal_handler_unblock(source, record.nativeId);
    }
    destroy() {
        if (this._dead) return;
        this._dead = true;
        this._signals.forEach(id => this._tray.disconnect(id));
        this._signals = [];
        Array.from(this._sources.keys()).forEach(source => this._release(source));
    }
};

var NotificationService = class NotificationService {
    constructor(options) {
        options = options || {};
        this._tray = options.tray || imports.ui.main.messageTray;
        this._dead = false; this._sources = new Map(); this._notifications = new Map();
        this._listeners = new Set(); this._incoming = new Set(); this._privacy = new Set(); this._nextId = 1;
        this._settings = options.settings || new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
        let scheduler = options.scheduler || {
            schedule: callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { callback(); return GLib.SOURCE_REMOVE; }),
            cancel: id => GLib.source_remove(id) };
        this._changed = new Runtime.Coalescer(scheduler.schedule, scheduler.cancel, () => this._listeners.forEach(callback => callback()));
        this._traySignals = [
            this._tray.connect('source-added', (tray, source) => this._trackSource(source)),
            this._tray.connect('source-removed', (tray, source) => this._removeSource(source))
        ];
        this._privacyId = this._settings.connect('changed::show-banners', () => {
            this._privacy.forEach(callback => callback(this.dnd)); this._changed.request();
        });
        this._tray.getSources().forEach(source => this._trackSource(source));
    }
    get dnd() { return !this._settings.get_boolean('show-banners'); }
    setDnd(value) { this._settings.set_boolean('show-banners', !value); }
    subscribe(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
    subscribeIncoming(callback) { this._incoming.add(callback); return () => this._incoming.delete(callback); }
    subscribePrivacy(callback) { this._privacy.add(callback); return () => this._privacy.delete(callback); }
    _trackSource(source) {
        if (this._dead || this._sources.has(source)) return;
        let ids = [
            source.connect('notification-added', (src, notification) => {
                this._trackNotification(source, notification);
                this._event(notification, false);
            }),
            source.connect('notification-show', (src, notification) => {
                this._trackNotification(source, notification);
                this._event(notification, !this.dnd);
            }),
            source.connect('destroy', () => this._removeSource(source))
        ];
        this._sources.set(source, ids);
        (source.notifications || []).forEach(notification => this._trackNotification(source, notification));
        this._changed.request();
    }
    _trackNotification(source, notification) {
        if (this._dead || this._notifications.has(notification)) return;
        let record = { id: this._nextId++, source: source, signals: [] };
        this._notifications.set(notification, record);
        record.signals.push(notification.connect('destroy', () => {
            this._dropNotification(notification); this._changed.request();
        }));
        record.signals.push(notification.connect('updated', () => this._changed.request()));
        this._changed.request();
    }
    _event(notification, show) {
        let record = this._notifications.get(notification);
        if (this._dead || !record) return;
        let summary = (String(record.source.title || '通知') + ' · ' + String(notification.title || '新消息'))
            .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, 220);
        this._incoming.forEach(callback => callback({ id: record.id, summary: summary, show: show }));
    }
    _dropNotification(notification) {
        let record = this._notifications.get(notification);
        if (!record) return;
        record.signals.forEach(id => { try { notification.disconnect(id); } catch (e) {} });
        this._notifications.delete(notification);
    }
    _removeSource(source) {
        let ids = this._sources.get(source);
        if (!ids) return;
        ids.forEach(id => { try { source.disconnect(id); } catch (e) {} });
        this._sources.delete(source);
        Array.from(this._notifications.entries()).forEach(([notification, record]) => {
            if (record.source === source) this._dropNotification(notification);
        });
        this._changed.request();
    }
    history() {
        return Array.from(this._notifications.entries()).map(([notification, record]) =>
            ({ source: record.source, notification: notification }));
    }
    clear() { this.history().forEach(item => { try { item.notification.destroy(); } catch (e) {} }); }
    destroy() {
        this._dead = true; this._changed.destroy();
        this._traySignals.forEach(id => this._tray.disconnect(id));
        this._settings.disconnect(this._privacyId);
        Array.from(this._sources.keys()).forEach(source => this._removeSource(source));
        this._listeners.clear(); this._incoming.clear(); this._privacy.clear();
    }
};

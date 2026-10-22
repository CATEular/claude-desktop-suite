/* Real GObject source signals: verify only the native banner handler is blocked. */
const { Gio, GObject } = imports.gi;
imports.searchPath.unshift('.');
const Services = imports.modules.notificationService;
function check(value, message) { if (!value) throw new Error(message); }
const Source = GObject.registerClass({ Signals: {
    'notification-added': { param_types: [GObject.TYPE_OBJECT] },
    'notification-show': { param_types: [GObject.TYPE_OBJECT] },
    'destroy': {},
} }, class Source extends GObject.Object {
    _init() { super._init(); this.title = 'Test application'; this.notifications = []; }
    show(notification) {
        if (!this.notifications.includes(notification)) {
            this.notifications.push(notification);
            this.emit('notification-added', notification);
        }
        this.emit('notification-show', notification);
    }
});
const Notification = GObject.registerClass({ Signals: { 'updated': {}, 'destroy': {} } },
class Notification extends GObject.Object {
    _init() { super._init(); this.title = 'Test notification'; this.sounds = 0; }
    playSound() { this.sounds++; }
});
const Tray = GObject.registerClass({ Signals: {
    'source-added': { param_types: [GObject.TYPE_OBJECT] },
    'source-removed': { param_types: [GObject.TYPE_OBJECT] },
    'queue-changed': {},
} }, class Tray extends GObject.Object {
    _init() { super._init(); this._sources = new Map(); this._notificationQueue = []; this.popups = 0; }
    add(source) {
        let showId = source.connect('notification-show', () => this.popups++);
        this._sources.set(source, { showId });
        this.emit('source-added', source);
    }
    remove(source) {
        source.disconnect(this._sources.get(source).showId);
        this._sources.delete(source);
        this.emit('source-removed', source);
    }
    getSources() { return Array.from(this._sources.keys()); }
    _updateNotificationTimeout(value) { check(value === 0, 'cancel existing banner timeout'); }
    _hideNotification(animate) { check(animate === false, 'close existing banner immediately'); this._notification = null; }
});
let tray = new Tray(), source = new Source(); tray.add(source);
let settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
settings.set_boolean('show-banners', true);
let service = new Services.NotificationService({ tray, settings });
let events = []; service.subscribeIncoming(event => events.push(event));
let queued = new Notification(); tray._notificationQueue.push(queued); tray._notification = new Notification();
let suppressor = new Services.NativeBannerSuppressor(tray);
check(!tray._notification && tray._notificationQueue.length === 0 && queued.sounds === 1,
    'existing banner closes and queued notifications drain without a popup');
let notification = new Notification(); source.show(notification);
check(tray.popups === 0 && events.length === 2 && events[1].show, 'only the Island receives the visible notification');
check(service.history().length === 1 && notification.sounds === 1, 'history and sound remain available');
for (let index = 0; index < 1000; index++) source.show(notification);
check(tray.popups === 0 && tray._notificationQueue.length === 0, 'notification updates cannot accumulate a native banner queue');
check(service.history().length === 1 && notification.sounds === 1001, 'updates preserve identity and sound policy');
service.setDnd(true); source.show(notification);
check(!events[events.length - 1].show && service.dnd && tray.popups === 0, 'DND still suppresses Island previews');
service.setDnd(false);
let added = new Source(); tray.add(added); added.show(new Notification());
check(tray.popups === 0 && service.history().length === 2, 'sources added after enable are covered');
tray.remove(added); // Native handler is already disconnected by MessageTray.
check(!suppressor._sources.has(added), 'removed source releases its own signal without touching a dead native handler');
suppressor.destroy(); suppressor.destroy(); source.show(notification);
check(tray.popups === 1 && notification.sounds === 1002, 'disable restores the native handler and removes the extra sound handler');
service.destroy();

// Signal blocking is reference-counted: leave another extension's block intact.
let nativeId = tray._sources.get(source).showId;
GObject.signal_handler_block(source, nativeId);
suppressor = new Services.NativeBannerSuppressor(tray); suppressor.destroy(); source.show(notification);
check(tray.popups === 1, 'restore preserves another owner’s existing signal block');
GObject.signal_handler_unblock(source, nativeId); source.show(notification);
check(tray.popups === 2, 'the original handler remains connected');
tray.remove(source);
print('PASS native notification replacement: real GObject handler blocking, Island/history/sound/DND, source lifecycle, burst handling and restoration.');

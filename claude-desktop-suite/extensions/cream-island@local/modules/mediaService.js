/* Verified local Bilibili MPRIS only. Discovery once; changes are signal-driven.
 * Every PID/proc read is asynchronous and cached by unique DBus owner. */
const { Gio, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const Runtime = (() => { try { return imports.misc.extensionUtils.getCurrentExtension().imports.modules.runtime; }
    catch (e) { return imports.modules.runtime; } })();

var DBusMediaBackend = class DBusMediaBackend {
    constructor() {
        this.bus = Gio.DBus.session; this.cancelToken = new Gio.Cancellable();
        this._subscriptions = new Set();
        let app = Gio.DesktopAppInfo.new('io.github.msojocs.bilibili.desktop');
        this.executable = app ? app.get_executable() : '';
    }
    call(destination, path, iface, method, parameters) {
        return new Promise((resolve, reject) => {
            this.bus.call(destination, path, iface, method, parameters, null,
                Gio.DBusCallFlags.NONE, 3000, this.cancelToken, (connection, result) => {
                    try { resolve(connection.call_finish(result).deep_unpack()); }
                    catch (e) { reject(e); }
                });
        });
    }
    listNames() { return this.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', 'ListNames', null).then(reply => reply[0]); }
    owner(name) { return this.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', 'GetNameOwner', new GLib.Variant('(s)', [name])).then(reply => reply[0]); }
    pid(owner) { return this.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [owner])).then(reply => reply[0]); }
    cmdline(pid) {
        return new Promise((resolve, reject) => {
            Gio.File.new_for_path('/proc/' + pid + '/cmdline').load_contents_async(this.cancelToken, (file, result) => {
                try {
                    let [ok, contents] = file.load_contents_finish(result);
                    if (!ok) throw new Error('process unavailable');
                    resolve(ByteArray.toString(contents));
                } catch (e) { reject(e); }
            });
        });
    }
    properties(owner) { return this.call(owner, '/org/mpris/MediaPlayer2',
        'org.freedesktop.DBus.Properties', 'GetAll',
        new GLib.Variant('(s)', ['org.mpris.MediaPlayer2.Player'])).then(reply => reply[0]); }
    position(owner) { return this.call(owner, '/org/mpris/MediaPlayer2',
        'org.freedesktop.DBus.Properties', 'Get',
        new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'Position'])).then(reply => reply[0]); }
    command(owner, command) { return this.call(owner, '/org/mpris/MediaPlayer2',
        'org.mpris.MediaPlayer2.Player', command, null); }
    _watch(sender, iface, signal, path, callback) {
        let id = this.bus.signal_subscribe(sender, iface, signal, path, null,
            Gio.DBusSignalFlags.NONE, (conn, from, obj, intf, sig, parameters) => callback(parameters.deep_unpack()));
        this._subscriptions.add(id);
        return () => { if (this._subscriptions.delete(id)) this.bus.signal_unsubscribe(id); };
    }
    watchOwners(callback) { return this._watch('org.freedesktop.DBus', 'org.freedesktop.DBus',
        'NameOwnerChanged', '/org/freedesktop/DBus', args => callback(...args)); }
    watchProperties(owner, callback) { return this._watch(owner, 'org.freedesktop.DBus.Properties',
        'PropertiesChanged', '/org/mpris/MediaPlayer2', args => callback(...args)); }
    destroy() {
        this.cancelToken.cancel();
        this._subscriptions.forEach(id => this.bus.signal_unsubscribe(id));
        this._subscriptions.clear();
    }
};
function read(dictionary, key, fallback) {
    return dictionary && Object.prototype.hasOwnProperty.call(dictionary, key) ? unpack(dictionary[key]) : fallback;
}
function unpack(value) {
    while (value && typeof value.deep_unpack === 'function') value = value.deep_unpack();
    return value;
}
var MediaService = class MediaService {
    constructor(backend, scheduler) {
        this._backend = backend || new DBusMediaBackend();
        this._scheduler = scheduler || {
            schedule: callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { callback(); return GLib.SOURCE_REMOVE; }),
            cancel: id => GLib.source_remove(id),
            after: (milliseconds, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
                callback(); return GLib.SOURCE_REMOVE;
            })
        };
        this._dead = false; this._started = false; this._names = new Map(); this._revisions = new Map();
        this._owner = ''; this._name = ''; this._props = {}; this._refreshOwner = ''; this._refreshDelta = {};
        this._bindingEpoch = 0; this._refreshEpoch = -1; this._refreshAgain = null; this._refreshInvalidated = new Set();
        this._stats = { propertyEvents: 0, propertiesFetches: 0, staleResponses: 0, publications: 0, tickerPublications: 0, positionReads: 0 };
        this._listeners = new Set(); this._tickers = new Set();
        this._snapshotGate = new Runtime.ValueGate(); this._tickerGate = new Runtime.ValueGate();
        this._snapshot = { title: '', playing: false, connected: false, status: 'Stopped',
            artist: '', length: 0, position: 0, previous: false, next: false, canPlay: false, metadataValid: false, noTrack: false };
        this._ownerCache = new Runtime.OwnerCache(async owner => {
            let pid = await this._backend.pid(owner);
            if (!pid || this._dead) return false;
            let cmdline = await this._backend.cmdline(pid);
            return Runtime.isBilibiliProcess(cmdline, this._backend.executable);
        });
        this._publishIdle = new Runtime.Coalescer(this._scheduler.schedule, this._scheduler.cancel, () => this._publish());
        this._refreshIdle = new Runtime.Coalescer(this._scheduler.schedule, this._scheduler.cancel, () => this._refresh());
        this._propertyUnsubscribe = null; this._ownerUnsubscribe = null;
        this._positionInFlight = false; this._positionVisible = false; this._positionTimer = 0; this._positionGeneration = 0;
    }
    subscribe(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
    subscribeTicker(callback) { this._tickers.add(callback); return () => this._tickers.delete(callback); }
    getSnapshot() { return this._snapshot; }
    async start() {
        if (this._started || this._dead) return;
        this._started = true;
        this._ownerUnsubscribe = this._backend.watchOwners((name, oldOwner, newOwner) => {
            if (this._dead || !name.startsWith('org.mpris.MediaPlayer2.')) return;
            this._revisions.set(name, (this._revisions.get(name) || 0) + 1);
            this._acceptOwner(name, newOwner);
        });
        try {
            let names = await this._backend.listNames();
            if (this._dead) return;
            await Promise.all(names.filter(name => name.startsWith('org.mpris.MediaPlayer2.')).map(async name => {
                let revision = this._revisions.get(name) || 0;
                try {
                    let owner = await this._backend.owner(name);
                    if (!this._dead && revision === (this._revisions.get(name) || 0)) await this._acceptOwner(name, owner);
                } catch (e) {}
            }));
        } catch (e) { /* NameOwnerChanged remains active even if startup discovery failed. */ }
    }
    async _acceptOwner(name, owner) {
        let previous = this._names.get(name);
        if (owner) this._names.set(name, owner); else this._names.delete(name);
        if (previous && !Array.from(this._names.values()).includes(previous)) this._ownerCache.remove(previous);
        if (this._name === name && this._owner !== owner) { this._unbind(); this._chooseKnown(); }
        if (!owner) { this._chooseKnown(); return; }
        let verified = await this._ownerCache.check(owner);
        if (this._dead || !verified || this._names.get(name) !== owner) return;
        if (!this._owner) this._bind(name, owner);
    }
    _chooseKnown() {
        if (this._dead || this._owner) return;
        this._names.forEach((owner, name) => this._acceptOwner(name, owner));
    }
    _unbind() {
        this._bindingEpoch++; this._positionGeneration++; this._refreshAgain = null;
        if (this._propertyUnsubscribe) this._propertyUnsubscribe();
        this._propertyUnsubscribe = null;
        this._owner = ''; this._name = ''; this._props = {};
        this._refreshIdle.cancel(); this._publishIdle.cancel();
        this._publish();
    }
    _bind(name, owner) {
        if (this._dead || this._owner === owner) return;
        let epoch = ++this._bindingEpoch;
        this._owner = owner; this._name = name; this._props = {};
        this._propertyUnsubscribe = this._backend.watchProperties(owner, (iface, changed, invalidated) => {
            if (this._dead || this._bindingEpoch !== epoch || this._owner !== owner || iface !== 'org.mpris.MediaPlayer2.Player') return;
            this._stats.propertyEvents++;
            let removed = invalidated || [];
            removed.forEach(key => delete this._props[key]);
            Object.assign(this._props, changed);
            if (this._refreshOwner === owner && this._refreshEpoch === epoch) {
                removed.forEach(key => { delete this._refreshDelta[key]; this._refreshInvalidated.add(key); });
                Object.keys(changed).forEach(key => this._refreshInvalidated.delete(key));
                Object.assign(this._refreshDelta, changed);
            }
            if (Object.keys(changed).concat(removed).some(key => ['Metadata', 'PlaybackStatus', 'CanPlay'].includes(key)))
                this._positionGeneration++;
            this._publishIdle.request();
            if (removed.length) this._refreshIdle.request();
        });
        this._refresh();
    }
    async _refresh() {
        let owner = this._owner, epoch = this._bindingEpoch;
        if (this._dead || !owner) return;
        if (this._refreshOwner === owner && this._refreshEpoch === epoch) {
            this._refreshAgain = { owner: owner, epoch: epoch }; return;
        }
        this._refreshOwner = owner; this._refreshEpoch = epoch;
        let delta = {}, invalidated = new Set();
        this._refreshDelta = delta; this._refreshInvalidated = invalidated;
        this._stats.propertiesFetches++;
        try {
            let props = await this._backend.properties(owner);
            if (!this._dead && this._owner === owner && this._bindingEpoch === epoch) {
                // Later changes and invalidation tombstones beat an older GetAll.
                this._props = Object.assign({}, props, delta);
                invalidated.forEach(key => delete this._props[key]);
                this._publishIdle.request();
            } else this._stats.staleResponses++;
        } catch (e) {} finally {
            if (this._refreshOwner === owner && this._refreshEpoch === epoch) {
                this._refreshOwner = '';
                if (!this._dead && this._owner === owner && this._bindingEpoch === epoch &&
                    this._refreshAgain && this._refreshAgain.owner === owner && this._refreshAgain.epoch === epoch) {
                    this._refreshAgain = null; this._refreshIdle.request();
                }
            }
        }
    }
    _publish() {
        if (this._dead) return;
        let p = this._props, metadata = read(p, 'Metadata', {});
        let status = read(p, 'PlaybackStatus', 'Stopped');
        let artists = read(metadata, 'xesam:artist', []);
        let title = String(read(metadata, 'xesam:title', '') || '').trim();
        let track = String(read(metadata, 'mpris:trackid', '') || '');
        let noTrack = track.endsWith('/NoTrack');
        let valid = Boolean(title) && !noTrack;
        let canPlay = read(p, 'CanPlay', false) === true;
        let snapshot = { connected: Boolean(this._owner),
            title: this._owner && valid && (status === 'Playing' || status === 'Paused') ? title : '',
            playing: Boolean(this._owner) && status === 'Playing' && canPlay && valid, status: status,
            canPlay: canPlay, metadataValid: valid, noTrack: noTrack,
            artist: Array.isArray(artists) ? artists.join(', ') : String(artists),
            length: Number(read(metadata, 'mpris:length', 0)),
            position: Number(read(p, 'Position', 0)),
            previous: Boolean(read(p, 'CanGoPrevious', false)), next: Boolean(read(p, 'CanGoNext', false)) };
        this._snapshot = snapshot;
        this._syncPositionTimer();
        if (this._snapshotGate.changed(snapshot)) {
            this._stats.publications++; this._listeners.forEach(callback => callback(snapshot));
        }
        let ticker = { title: snapshot.playing ? snapshot.title : '', playing: snapshot.playing };
        if (this._tickerGate.changed(ticker)) {
            this._stats.tickerPublications++; this._tickers.forEach(callback => callback(ticker.title, ticker.playing));
        }
    }
    setPositionVisible(visible) {
        this._positionVisible = Boolean(visible);
        if (!visible) this._positionGeneration++;
        this._syncPositionTimer();
    }
    _syncPositionTimer() {
        let needed = !this._dead && this._positionVisible && this._snapshot.playing;
        if (!needed && this._positionTimer) {
            this._scheduler.cancel(this._positionTimer); this._positionTimer = 0;
        }
        if (needed && !this._positionTimer) this._positionTimer = this._scheduler.after(10000, () => {
            this._positionTimer = 0;
            this.readPosition(); this._syncPositionTimer();
        });
    }
    async readPosition() {
        let owner = this._owner;
        if (this._dead || !owner || !this._positionVisible || this._positionInFlight) return;
        let generation = this._positionGeneration;
        this._positionInFlight = true;
        this._stats.positionReads++;
        try {
            let position = await this._backend.position(owner);
            if (!this._dead && this._positionVisible && generation === this._positionGeneration && this._owner === owner) {
                this._props.Position = position; this._publishIdle.request(); }
        } catch (e) {} finally { this._positionInFlight = false; }
    }
    getDiagnostics() {
        let s = this._snapshot;
        return { ownerPresent: Boolean(this._owner), connected: s.connected,
            playbackStatus: ['Playing', 'Paused', 'Stopped'].includes(s.status) ? s.status : 'Unknown',
            canPlay: s.canPlay, metadataValid: s.metadataValid, noTrack: s.noTrack,
            titlePresent: Boolean(s.title), topBarEligible: s.playing,
            counters: Object.assign({}, this._stats) };
    }
    command(command) {
        if (!this._dead && this._owner && ['Previous', 'Next', 'PlayPause'].includes(command))
            this._backend.command(this._owner, command).catch(() => {});
    }
    destroy() {
        this.setPositionVisible(false);
        this._dead = true;
        if (this._propertyUnsubscribe) this._propertyUnsubscribe();
        if (this._ownerUnsubscribe) this._ownerUnsubscribe();
        this._publishIdle.destroy(); this._refreshIdle.destroy(); this._backend.destroy();
        this._ownerCache.clear(); this._names.clear(); this._listeners.clear(); this._tickers.clear();
    }
};

/* Runtime primitives shared by production services and deterministic tests. */
var Coalescer = class Coalescer {
    constructor(schedule, cancel, callback) {
        this._schedule = schedule; this._cancel = cancel; this._callback = callback;
        this._id = 0; this._dead = false;
    }
    request() {
        if (this._dead || this._id) return;
        this._id = this._schedule(() => {
            this._id = 0;
            if (!this._dead) this._callback();
        });
    }
    cancel() { if (this._id) this._cancel(this._id); this._id = 0; }
    destroy() { this._dead = true; this.cancel(); }
};
var ValueGate = class ValueGate {
    constructor() { this._key = undefined; }
    changed(value) {
        let key = JSON.stringify(value);
        if (key === this._key) return false;
        this._key = key; return true;
    }
};
var OwnerCache = class OwnerCache {
    constructor(verify) { this._verify = verify; this._owners = new Map(); }
    check(owner) {
        if (!this._owners.has(owner)) this._owners.set(owner,
            Promise.resolve().then(() => this._verify(owner)).catch(() => false));
        return this._owners.get(owner);
    }
    remove(owner) { this._owners.delete(owner); }
    clear() { this._owners.clear(); }
};
var isBilibiliProcess = function(cmdline, desktopExecutable) {
    let executable = String(cmdline || '').split('\0')[0];
    // Only process executable identity; titles/URLs/argv app-id substrings do
    // not prove identity. Never fetch metadata from a rejected owner.
    if (!executable.startsWith('/')) return false;
    let basename = executable.split('/').pop().toLowerCase();
    if (/^(chrome|chromium|chromium-browser|firefox|brave|msedge)(-.*)?$/.test(basename)) return false;
    return executable.startsWith('/opt/apps/io.github.msojocs.bilibili/') ||
        Boolean(desktopExecutable && desktopExecutable.startsWith('/') &&
            basename.includes('bilibili') && executable === desktopExecutable);
};
// Shared by native width and popup transitions; removed transitions may already
// have queued completion callbacks, so validity is checked independently.
var TransitionGuard = class TransitionGuard {
    constructor(actor) { this._actor = actor; this._generation = 0; this._dead = false; }
    begin() { this._actor.remove_all_transitions(); return ++this._generation; }
    current(token) { return !this._dead && token === this._generation; }
    destroy() { this._dead = true; this._generation++; this._actor.remove_all_transitions(); }
};
var LatestDelivery = class LatestDelivery {
    constructor(schedule, cancel, deliver) {
        this._value = null;
        this._idle = new Coalescer(schedule, cancel, () => deliver(this._value));
    }
    push(value) { this._value = value; this._idle.request(); }
    destroy() { this._idle.destroy(); this._value = null; }
};
var VisibleRelayout = class VisibleRelayout {
    constructor(schedule, cancel, callback) {
        this._active = false; this._dead = false; this.pending = false;
        this.stats = { requests: 0, runs: 0 };
        this._cancel = cancel; this._schedule = schedule; this._callback = callback; this._id = 0;
    }
    setActive(active) {
        this._active = Boolean(active);
        if (!active && this._id) { this._cancel(this._id); this._id = 0; this.pending = false; }
    }
    request() {
        if (!this._active || this._dead) return;
        this.stats.requests++;
        if (this._id) return;
        this.pending = true;
        this._id = this._schedule(() => {
            this._id = 0; this.pending = false;
            if (this._active && !this._dead) { this.stats.runs++; this._callback(); }
        });
    }
    destroy() { this.setActive(false); this._dead = true; }
};

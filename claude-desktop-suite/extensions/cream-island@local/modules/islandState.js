/* No GI/UI imports: one interruptible notification expiry, deterministic clock. */
var IslandState = class IslandState {
    constructor(clock, publish) {
        this._clock = clock; this._publish = publish;
        this._timer = 0; this._generation = 0; this._dead = false;
        this._locked = false; this._dnd = false; this._open = false;
        this._media = { title: '', playing: false };
        this._summary = ''; this._unread = 0;
        this._seen = new Set(); this._lastShown = '';
        this._last = '';
        this._emit();
    }
    snapshot() {
        let mode = this._locked ? 'locked' : this._open ? 'open' :
            this._media.playing && this._media.title ? 'media' : this._summary ? 'notification' : 'idle';
        return { mode: mode, title: mode === 'media' ? this._media.title :
            mode === 'notification' ? this._summary : '',
            playing: mode === 'media' && this._media.playing,
            unread: this._locked ? 0 : this._unread };
    }
    _emit() {
        if (this._dead) return;
        let value = this.snapshot(), key = JSON.stringify(value);
        if (key === this._last) return;
        this._last = key; this._publish(value);
    }
    _clearBanner() {
        this._generation++;
        if (this._timer) this._clock.cancel(this._timer);
        this._timer = 0; this._summary = '';
    }
    notification(event) {
        if (this._dead) return;
        if (!this._seen.has(event.id)) {
            this._seen.add(event.id); this._unread++;
            if (this._seen.size > 512) this._seen.delete(this._seen.values().next().value);
        }
        let key = event.id + ':' + event.summary;
        if (event.show && key !== this._lastShown) {
            this._lastShown = key;
            // DND/open/media only add a badge. Details never survive locking.
            if (!this._locked && !this._dnd && !this._open && !(this._media.playing && this._media.title)) {
                this._clearBanner();
                this._summary = String(event.summary || '新通知');
                let token = this._generation;
                this._timer = this._clock.after(5000, () => {
                    if (this._dead || token !== this._generation) return;
                    this._timer = 0; this._summary = ''; this._emit();
                });
            }
        }
        this._emit();
    }
    media(title, playing) {
        if (this._dead) return;
        this._media = { title: String(title || ''), playing: Boolean(playing) };
        if (title && playing) this._clearBanner();
        this._emit();
    }
    open(value) {
        if (this._dead) return;
        this._open = Boolean(value);
        if (value) this._clearBanner();
        this._emit();
    }
    privacy(locked, dnd) {
        if (this._dead) return;
        this._locked = Boolean(locked); this._dnd = Boolean(dnd);
        if (locked || dnd) this._clearBanner();
        if (locked) this._open = false;
        this._emit();
    }
    acknowledge() {
        if (this._dead) return;
        this._unread = 0; this._seen.clear(); this._lastShown = '';
        this._emit();
    }
    destroy() { this._clearBanner(); this._dead = true; this._publish = () => {}; }
};

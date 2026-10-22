/* Click-path scheduler used by the popup. Shell response precedes constructors,
 * cached pages present immediately, measurement and heavy cleanup are deferred. */
var PageFlow = class PageFlow {
    constructor(adapter, scheduler, Runtime) {
        this._a = adapter; this._s = scheduler; this._active = false; this._dead = false;
        this._current = null; this._id = ''; this._wanted = ''; this._build = 0; this._cleanups = new Map();
        this.stats = { requests: 0, noops: 0, builds: 0, presents: 0, measurements: 0, cleanups: 0 };
        this._measure = new Runtime.VisibleRelayout(scheduler.schedule, scheduler.cancel, () => {
            this.stats.measurements++; this._a.measure(this._current);
        });
    }
    open(id) {
        if (this._dead) return;
        if (this._active) { this.switch(id); return; }
        this._active = true; this._measure.setActive(true);
        this._a.openShell();
        if (this._current && this._id === id && this._a.cached(id) === this._current) {
            this._cancelCleanup(this._current); this._a.present(this._current,id); this._a.activate(this._current, true); this._measure.request(); return;
        }
        this.switch(id);
    }
    switch(id) {
        if (this._dead || !this._active) return;
        this.stats.requests++;
        if (id === this._id && this._current && this._a.cached(id) === this._current) {
            if (this._build) { this._s.cancel(this._build); this._build = 0; }
            this._wanted = id; this.stats.noops++; return;
        }
        if (this._build && id === this._wanted) { this.stats.noops++; return; }
        this._wanted = id;
        if (this._build) { this._s.cancel(this._build); this._build = 0; }
        let cached = this._a.cached(id);
        if (cached) { this._show(cached, id); return; }
        this._build = this._s.schedule(() => {
            this._build = 0;
            if (this._dead || !this._active || id !== this._wanted) return;
            this.stats.builds++;
            this._show(this._a.build(id), id);
        });
    }
    _show(view, id) {
        if (!view) return;
        if (this._current && this._current !== view) {
            this._a.activate(this._current, false); this._deferCleanup(this._current);
        }
        this._cancelCleanup(view);
        this._current = view; this._id = id;
        this.stats.presents++; this._a.present(view, id); this._a.activate(view, true);
        this._measure.request();
    }
    ready(view) { if (this._active && this._current === view) this._measure.request(); }
    _cancelCleanup(view) {
        if (this._cleanups.has(view)) { this._s.cancel(this._cleanups.get(view)); this._cleanups.delete(view); }
    }
    _deferCleanup(view) {
        if (this._cleanups.has(view)) return;
        let token = this._s.schedule(() => {
            this._cleanups.delete(view);
            if (this._dead || (this._active && this._current === view)) return;
            this.stats.cleanups++; this._a.cleanup(view);
        });
        this._cleanups.set(view, token);
    }
    close(immediate) {
        if (!this._active || this._dead) return;
        this._active = false;
        if (this._build) { this._s.cancel(this._build); this._build = 0; }
        this._measure.setActive(false);
        this._a.closeShell(immediate); // Respond before clone destruction.
        if (this._current) { this._a.activate(this._current, false); this._deferCleanup(this._current); }
    }
    destroy() {
        this._dead = true; this._measure.destroy();
        if (this._build) this._s.cancel(this._build);
        this._cleanups.forEach(id => this._s.cancel(id)); this._cleanups.clear();
    }
};

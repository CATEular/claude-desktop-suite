/* Fixed-anchor rendering controller. Production uses the same entry/target
 * gates as tests; frame-by-frame background transforms never enter this path. */
var DockController = class DockController {
    constructor(view) {
        this._view = view; this._bounds = null; this._state = null; this._plan = null;
        this._stateKey = ''; this._boundsKey = ''; this._dead = false;
        this.stats = { renderEntries: 0, contentUpdates: 0, boundsChanges: 0, measurements: 0, layouts: 0, animations: 0 };
    }
    setBounds(bounds) {
        if (this._dead) return false;
        let key = JSON.stringify(bounds);
        if (key === this._boundsKey) return false;
        this._boundsKey = key; this._bounds = bounds; this.stats.boundsChanges++;
        if (this._state) this._layout();
        return true;
    }
    render(state) {
        if (this._dead) return;
        this.stats.renderEntries++;
        let key = JSON.stringify(state);
        if (key === this._stateKey) return;
        this._state = state; this._stateKey = key;
        this.stats.contentUpdates++; this._view.content(state);
        if (this._bounds) this._layout();
    }
    _layout() {
        this.stats.measurements++;
        let plan = this._view.measure(this._state, this._bounds);
        if (this._plan && JSON.stringify(plan) === JSON.stringify(this._plan)) return;
        let previous = this._plan; this._plan = plan; this.stats.layouts++;
        this._view.layout(plan);
        if (previous && previous.target !== plan.target && this._view.animate(plan, previous)) this.stats.animations++;
        else if (!previous || previous.target === plan.target) this._view.settle(plan);
    }
    destroy() { this._dead = true; }
};

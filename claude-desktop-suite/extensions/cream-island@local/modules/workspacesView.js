/* Visible-only, two-column workspace cards. No nested scroll viewport can
 * collapse to zero; the popup owns vertical scrolling. */
const { Clutter, GLib, GObject, Meta, St } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Runtime = Me.imports.modules.runtime;
const Layout = Me.imports.modules.layout;
var WorkspacesView = GObject.registerClass({ Signals: {
    'workspace-switched': {}, 'layout-ready': {}
} }, class WorkspacesView extends St.BoxLayout {
    _init() {
        super._init({ vertical: true, style_class: 'cream-island-card cream-island-workspaces' });
        this._wm = global.workspace_manager; this._active = false; this._columns = 2;
        this._signals = []; this._workspaceSignals = new Map();
        this._stats = { renders: 0, ready: 0, clones: 0 };
        this._refresh = new Runtime.VisibleRelayout(
            callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { callback(); return GLib.SOURCE_REMOVE; }),
            id => GLib.source_remove(id), () => this._render());
        this._countLabel = new St.Label({ style_class: 'cream-island-subtitle', text: '工作区预览' });
        this.add_child(this._countLabel);
        this._gridLayout = new Clutter.GridLayout({ column_homogeneous: true, row_homogeneous: true });
        this._grid = new St.Widget({ layout_manager: this._gridLayout, style_class: 'cream-island-workspace-grid',
            x_align: Clutter.ActorAlign.CENTER, x_expand: true });
        this.add_child(this._grid);
        ['workspace-added', 'workspace-removed'].forEach(signal => this._connect(this._wm, signal, () => {
            this._syncWorkspaceSignals(); this._refresh.request();
        }));
        this._connect(this._wm, 'active-workspace-changed', () => this._refresh.request());
        this._connect(global.display, 'window-created', () => this._refresh.request());
        this._syncWorkspaceSignals();
    }
    _connect(object, signal, callback) { this._signals.push({ object, id: object.connect(signal, callback) }); }
    _syncWorkspaceSignals() {
        let current = new Set();
        for (let i = 0; i < this._wm.get_n_workspaces(); i++) {
            let workspace = this._wm.get_workspace_by_index(i); current.add(workspace);
            if (this._workspaceSignals.has(workspace)) continue;
            this._workspaceSignals.set(workspace, ['window-added', 'window-removed'].map(signal =>
                workspace.connect(signal, () => this._refresh.request())));
        }
        this._workspaceSignals.forEach((ids, workspace) => {
            if (!current.has(workspace)) { ids.forEach(id => workspace.disconnect(id)); this._workspaceSignals.delete(workspace); }
        });
    }
    setAvailableWidth(width) {
        let s = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let available = this.get_theme_node().adjust_for_width(width);
        let columns = available >= 452 * s ? 2 : 1;
        if (columns !== this._columns) { this._columns = columns; this._refresh.request(); }
    }
    setActive(active) {
        this._active = active; this._refresh.setActive(active);
        if (active) this._refresh.request();
    }
    cleanupHidden() { if (!this._active) { this._grid.destroy_all_children(); this._stats.clones = 0; } }
    _render() {
        if (!this._active) return;
        this._stats.renders++; this._stats.clones = 0;
        this._grid.destroy_all_children();
        let s = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._gridLayout.column_spacing = 12 * s; this._gridLayout.row_spacing = 12 * s;
        let count = this._wm.get_n_workspaces(), active = this._wm.get_active_workspace_index();
        this._countLabel.text = `共 ${count} 个工作区 · 当前 ${active + 1}`;
        for (let i = 0; i < count; i++) {
            let workspace = this._wm.get_workspace_by_index(i);
            let windows = workspace.list_windows().filter(window => !window.is_on_all_workspaces() &&
                !window.skip_taskbar && window.get_window_type() === Meta.WindowType.NORMAL);
            let button = new St.Button({ style_class: 'cream-island-workspace-card', width: 220 * s,
                accessible_name: `工作区 ${i + 1}`, can_focus: true });
            if (i === active) button.add_style_class_name('active');
            let column = new St.BoxLayout({ vertical: true, style_class: 'cream-island-workspace-content' });
            column.add_child(new St.Label({ text: `工作区 ${i + 1} · ${windows.length} 个窗口`, style_class: 'cream-island-subtitle' }));
            let preview = new St.Widget({ layout_manager: new Clutter.BinLayout(), width: 196 * s, height: 124 * s,
                style_class: 'cream-island-workspace-preview-box', x_align: Clutter.ActorAlign.CENTER });
            let actor = windows.length ? windows[0].get_compositor_private() : null;
            if (actor && actor.width > 0 && actor.height > 0) {
                let size = Layout.fitThumbnail(actor.width, actor.height, 192 * s, 120 * s);
                preview.add_child(new Clutter.Clone({ source: actor, width: size.width, height: size.height,
                    x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER }));
                this._stats.clones++;
            } else preview.add_child(new St.Icon({ icon_name: 'view-dual-symbolic', icon_size: 32,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER }));
            column.add_child(preview); button.set_child(column);
            let index = i;
            button.connect('clicked', () => {
                this._wm.get_workspace_by_index(index).activate(global.get_current_time());
                this.emit('workspace-switched');
            });
            this._gridLayout.attach(button, i % this._columns, Math.floor(i / this._columns), 1, 1);
        }
        this._stats.ready++; this.emit('layout-ready');
    }
    getDiagnostics() { return Object.assign({ active: this._active, columns: this._columns, pending: this._refresh.pending }, this._stats); }
    destroy() {
        this._active = false; this._refresh.destroy();
        this._signals.forEach(({object, id}) => object.disconnect(id));
        this._workspaceSignals.forEach((ids, object) => ids.forEach(id => object.disconnect(id)));
        this._workspaceSignals.clear(); super.destroy();
    }
});

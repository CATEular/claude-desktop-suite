/* modules/powerView.js
 * Power menu offering Lock, Suspend, Logout, Reboot, and Power Off
 * with explicit confirmation safety guard.
 */

const { Clutter, Gio, GLib, GObject, St } = imports.gi;
const Main = imports.ui.main;

var PowerView = GObject.registerClass( class PowerView extends St.BoxLayout {
    _init() {
        super._init({
            vertical: true,
            style_class: 'cream-island-card'
        });

        this._confirmAction = null;
        this._buildUI();
    }

    _buildUI() {
        let title = new St.Label({
            text: '电源管理',
            style_class: 'cream-island-title'
        });
        this.add_child(title);

        // Buttons Grid
        let grid = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(grid);

        let actions = [
            { id: 'lock', label: '锁定屏幕', icon: 'system-lock-screen-symbolic', destructive: false },
            { id: 'suspend', label: '系统挂起', icon: 'media-playback-pause-symbolic', destructive: false },
            { id: 'logout', label: '注销会话', icon: 'system-log-out-symbolic', destructive: true },
            { id: 'reboot', label: '重启电脑', icon: 'system-reboot-symbolic', destructive: true },
            { id: 'shutdown', label: '关闭电源', icon: 'system-shutdown-symbolic', destructive: true }
        ];

        actions.forEach(act => {
            let btn = new St.Button({
                style_class: act.destructive ? 'cream-island-btn cream-island-power-btn cream-island-btn-danger' : 'cream-island-btn cream-island-power-btn',
                reactive: true
            });
            let col = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER });
            let icon = new St.Icon({ icon_name: act.icon, style_class: 'cream-island-slider-icon' });
            let lbl = new St.Label({ text: act.label, style_class: 'cream-island-subtitle' });
            col.add_child(icon);
            col.add_child(lbl);
            btn.set_child(col);

            btn.connect('clicked', () => this._handleActionClick(act));
            grid.add_child(btn);
        });

        // Confirmation Box (Hidden by default)
        this._confirmBox = new St.BoxLayout({
            vertical: true,
            style_class: 'cream-island-card',
            visible: false
        });
        this._confirmLabel = new St.Label({
            text: '确认要执行此会话操作吗？',
            style_class: 'cream-island-title',
            x_align: Clutter.ActorAlign.CENTER
        });
        this._confirmBox.add_child(this._confirmLabel);

        let confirmBtnRow = new St.BoxLayout({ vertical: false, x_align: Clutter.ActorAlign.CENTER });
        this._doConfirmBtn = new St.Button({
            label: '确认继续',
            style_class: 'cream-island-btn-accent'
        });
        this._doConfirmBtn.connect('clicked', () => this._executeConfirmedAction());
        confirmBtnRow.add_child(this._doConfirmBtn);

        let cancelBtn = new St.Button({
            label: '取消',
            style_class: 'cream-island-btn'
        });
        cancelBtn.connect('clicked', () => {
            this._confirmBox.visible = false;
            this._confirmAction = null;
        });
        confirmBtnRow.add_child(cancelBtn);

        this._confirmBox.add_child(confirmBtnRow);
        this.add_child(this._confirmBox);
    }

    _handleActionClick(act) {
        if (!act.destructive) {
            this._executeAction(act.id);
            return;
        }

        // Show confirmation prompt
        this._confirmAction = act.id;
        this._confirmLabel.set_text(`⚠️ 确定要执行「${act.label}」吗？未保存的工作可能会丢失。`);
        this._confirmBox.visible = true;
    }

    _executeConfirmedAction() {
        let action = this._confirmAction;
        this._confirmBox.visible = false;
        this._confirmAction = null;
        if (action) {
            this._executeAction(action);
        }
    }

    _executeAction(actionId) {
        try {
            if (actionId === 'lock') {
                if (Main.screenShield) {
                    Main.screenShield.lock(true);
                } else {
                    GLib.spawn_command_line_async('loginctl lock-session');
                }
            } else if (actionId === 'suspend') {
                GLib.spawn_command_line_async('systemctl suspend');
            } else if (actionId === 'logout') {
                GLib.spawn_command_line_async('gnome-session-quit --logout');
            } else if (actionId === 'reboot') {
                GLib.spawn_command_line_async('gnome-session-quit --reboot');
            } else if (actionId === 'shutdown') {
                GLib.spawn_command_line_async('gnome-session-quit --power-off');
            }
        } catch (e) {
            log('[CreamIsland] Failed to execute power action ' + actionId + ': ' + e);
        }
    }
});

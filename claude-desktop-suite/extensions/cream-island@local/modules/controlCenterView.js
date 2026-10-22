/* modules/controlCenterView.js
 * Control Center integrating system volume, brightness, battery,
 * Wi-Fi, Bluetooth, Do Not Disturb, and system settings.
 */

const { Clutter, Gio, GLib, GObject, St } = imports.gi;
const Main = imports.ui.main;
const Slider = imports.ui.slider;

var ControlCenterView = GObject.registerClass( class ControlCenterView extends St.BoxLayout {
    _init() {
        super._init({
            vertical: true,
            style_class: 'cream-island-card'
        });

        this._notifSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
        this._buildUI();
        this._updateState();
    }

    _buildUI() {
        // Title Row
        let headerRow = new St.BoxLayout({ vertical: false });
        let title = new St.Label({
            text: '控制中心',
            style_class: 'cream-island-title',
            x_expand: true
        });
        headerRow.add_child(title);

        let settingsBtn = new St.Button({
            label: '系统设置',
            style_class: 'cream-island-btn'
        });
        settingsBtn.connect('clicked', () => {
            try {
                GLib.spawn_command_line_async('gnome-control-center');
            } catch (e) {
                log('[CreamIsland] Failed to launch gnome-control-center: ' + e);
            }
        });
        headerRow.add_child(settingsBtn);
        this.add_child(headerRow);

        // Sliders Card (Volume & Brightness)
        let slidersCard = new St.BoxLayout({
            vertical: true,
            style_class: 'cream-island-card'
        });
        this.add_child(slidersCard);

        // Volume Row
        let volRow = new St.BoxLayout({
            vertical: false,
            style_class: 'cream-island-slider-row',
            y_align: Clutter.ActorAlign.CENTER
        });
        this._volMuteBtn = new St.Button({
            style_class: 'cream-island-btn'
        });
        this._volIcon = new St.Icon({
            icon_name: 'audio-volume-high-symbolic',
            style_class: 'cream-island-slider-icon'
        });
        this._volMuteBtn.set_child(this._volIcon);
        this._volMuteBtn.connect('clicked', () => this._toggleMute());
        volRow.add_child(this._volMuteBtn);

        this._volSlider = new Slider.Slider(0.5);
        this._volSlider.x_expand = true;
        this._volSlider.connect('notify::value', () => this._onVolumeSliderChanged());
        volRow.add_child(this._volSlider);

        this._volPercentLabel = new St.Label({
            text: '50%',
            style_class: 'cream-island-subtitle',
            y_align: Clutter.ActorAlign.CENTER
        });
        volRow.add_child(this._volPercentLabel);
        slidersCard.add_child(volRow);

        // Brightness Row
        this._brightRow = new St.BoxLayout({
            vertical: false,
            style_class: 'cream-island-slider-row',
            y_align: Clutter.ActorAlign.CENTER
        });
        let brightIcon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'cream-island-slider-icon'
        });
        this._brightRow.add_child(brightIcon);

        this._brightSlider = new Slider.Slider(0.5);
        this._brightSlider.x_expand = true;
        this._brightSlider.connect('notify::value', () => this._onBrightnessSliderChanged());
        this._brightRow.add_child(this._brightSlider);

        this._brightPercentLabel = new St.Label({
            text: '50%',
            style_class: 'cream-island-subtitle',
            y_align: Clutter.ActorAlign.CENTER
        });
        this._brightRow.add_child(this._brightPercentLabel);
        slidersCard.add_child(this._brightRow);

        // Quick Toggles Grid (Wi-Fi, Bluetooth, DND, Battery)
        let togglesGrid = new St.BoxLayout({
            vertical: false
        });
        this.add_child(togglesGrid);

        // Wi-Fi Tile
        let wifiTile = new St.Button({
            style_class: 'cream-island-toggle-tile',
            x_expand: true
        });
        let wifiBox = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER });
        let wifiIcon = new St.Icon({ icon_name: 'network-wireless-symbolic', style_class: 'cream-island-slider-icon' });
        let wifiLabel = new St.Label({ text: '无线网络', style_class: 'cream-island-subtitle' });
        wifiBox.add_child(wifiIcon);
        wifiBox.add_child(wifiLabel);
        wifiTile.set_child(wifiBox);
        wifiTile.connect('clicked', () => {
            GLib.spawn_command_line_async('gnome-control-center wifi');
        });
        togglesGrid.add_child(wifiTile);

        // Bluetooth Tile
        let btTile = new St.Button({
            style_class: 'cream-island-toggle-tile',
            x_expand: true
        });
        let btBox = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER });
        let btIcon = new St.Icon({ icon_name: 'bluetooth-active-symbolic', style_class: 'cream-island-slider-icon' });
        let btLabel = new St.Label({ text: '蓝牙设置', style_class: 'cream-island-subtitle' });
        btBox.add_child(btIcon);
        btBox.add_child(btLabel);
        btTile.set_child(btBox);
        btTile.connect('clicked', () => {
            GLib.spawn_command_line_async('gnome-control-center bluetooth');
        });
        togglesGrid.add_child(btTile);

        // DND (Do Not Disturb) Tile
        this._dndTile = new St.Button({
            style_class: 'cream-island-toggle-tile',
            x_expand: true
        });
        let dndBox = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER });
        this._dndIcon = new St.Icon({ icon_name: 'notifications-symbolic', style_class: 'cream-island-slider-icon' });
        this._dndLabel = new St.Label({ text: '勿扰模式', style_class: 'cream-island-subtitle' });
        dndBox.add_child(this._dndIcon);
        dndBox.add_child(this._dndLabel);
        this._dndTile.set_child(dndBox);
        this._dndTile.connect('clicked', () => this._toggleDnd());
        togglesGrid.add_child(this._dndTile);

        // Battery Tile
        this._batteryTile = new St.BoxLayout({
            vertical: true,
            style_class: 'cream-island-toggle-tile',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER
        });
        this._batteryIcon = new St.Icon({ icon_name: 'battery-level-90-symbolic', style_class: 'cream-island-slider-icon' });
        this._batteryLabel = new St.Label({ text: '电池 100%', style_class: 'cream-island-subtitle' });
        this._batteryTile.add_child(this._batteryIcon);
        this._batteryTile.add_child(this._batteryLabel);
        togglesGrid.add_child(this._batteryTile);
    }

    _getSystemVolumeOutput() {
        try {
            let am = Main.panel.statusArea.aggregateMenu;
            if (am && am._volume && am._volume._volumeMenu && am._volume._volumeMenu._output) {
                return am._volume._volumeMenu._output;
            }
        } catch (e) {}
        return null;
    }

    _getSystemBrightness() {
        try {
            let am = Main.panel.statusArea.aggregateMenu;
            if (am && am._brightness && am._brightness._slider) {
                return am._brightness;
            }
        } catch (e) {}
        return null;
    }

    _updateState() {
        // Volume
        let output = this._getSystemVolumeOutput();
        if (output && output._slider) {
            let val = Math.min(1.0, output._slider.value);
            this._volSlider.value = val;
            this._volPercentLabel.set_text(Math.round(val * 100) + '%');
            let isMuted = output._stream ? output._stream.is_muted : false;
            this._volIcon.icon_name = isMuted ? 'audio-volume-muted-symbolic' : 'audio-volume-high-symbolic';
        }

        // Brightness
        let bright = this._getSystemBrightness();
        if (bright) {
            this._brightRow.visible = true;
            let val = bright._slider.value;
            this._brightSlider.value = val;
            this._brightPercentLabel.set_text(Math.round(val * 100) + '%');
        } else {
            this._brightRow.visible = false;
        }

        // DND
        let showBanners = this._notifSettings.get_boolean('show-banners');
        let dndActive = !showBanners;
        if (dndActive) {
            this._dndTile.add_style_class_name('active');
            this._dndLabel.set_text('勿扰: 开启');
            this._dndIcon.icon_name = 'notifications-disabled-symbolic';
        } else {
            this._dndTile.remove_style_class_name('active');
            this._dndLabel.set_text('勿扰: 关闭');
            this._dndIcon.icon_name = 'notifications-symbolic';
        }

        // Battery
        try {
            let pw = Main.panel.statusArea.aggregateMenu._power;
            if (pw && pw._proxy && pw._proxy.IsPresent) {
                this._batteryTile.visible = true;
                let pct = pw._proxy.Percentage;
                let state = pw._proxy.State;
                let stateStr = (state === 1) ? '充电中' : (state === 4 ? '已充满' : '');
                this._batteryLabel.set_text(`${pct}% ${stateStr}`);
            } else {
                this._batteryLabel.set_text('交流供电');
            }
        } catch (e) {}
    }

    _toggleMute() {
        let output = this._getSystemVolumeOutput();
        if (output && output._stream) {
            output._stream.change_is_muted(!output._stream.is_muted);
            this._updateState();
        }
    }

    _onVolumeSliderChanged() {
        let val = this._volSlider.value;
        this._volPercentLabel.set_text(Math.round(val * 100) + '%');
        let output = this._getSystemVolumeOutput();
        if (output && output._slider) {
            output._slider.value = val;
        }
    }

    _onBrightnessSliderChanged() {
        let val = this._brightSlider.value;
        this._brightPercentLabel.set_text(Math.round(val * 100) + '%');
        let bright = this._getSystemBrightness();
        if (bright && bright._slider) {
            bright._slider.value = val;
        }
    }

    _toggleDnd() {
        let current = this._notifSettings.get_boolean('show-banners');
        this._notifSettings.set_boolean('show-banners', !current);
        this._updateState();
    }
});

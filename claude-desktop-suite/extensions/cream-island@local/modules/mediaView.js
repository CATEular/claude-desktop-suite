/* Visible-only media UI. The single shared MediaService owns discovery/signals. */
const { Clutter, Gio, GLib, GObject, Shell, St } = imports.gi;
const MprisUtil = imports.misc.extensionUtils.getCurrentExtension().imports.modules.mprisUtil.MprisUtil;
var MediaView = GObject.registerClass(class MediaView extends St.BoxLayout {
    _init(service) {
        super._init({ vertical: true, style_class: 'cream-island-card' });
        this._service = service; this._active = false;
        this._buildUI();
        this._unsubscribe = service.subscribe(snapshot => {
            if (this._active) this._renderSnapshot(snapshot);
        });
    }
    _buildUI() {
        // Header Row
        let headerRow = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, margin_bottom: 12 });
        let title = new St.Label({
            text: '哔哩哔哩 · 媒体控制',
            style_class: 'cream-island-title',
            x_expand: true
        });
        headerRow.add_child(title);

        this._statusBadge = new St.Label({
            text: '未连接',
            style_class: 'cream-island-subtitle'
        });
        headerRow.add_child(this._statusBadge);
        this.add_child(headerRow);

        // Player Card (visible when client is playing/paused)
        this._playerCard = new St.BoxLayout({
            vertical: true,
            style_class: 'cream-island-card-inner',
            visible: false
        });
        this.add_child(this._playerCard);

        let mediaInfoRow = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, margin_bottom: 10 });
        this._appIcon = new St.Icon({
            icon_name: 'io.github.msojocs.bilibili',
            icon_size: 48,
            style_class: 'cream-island-media-app-icon'
        });
        mediaInfoRow.add_child(this._appIcon);

        let textCol = new St.BoxLayout({ vertical: true, x_expand: true });
        this._titleLabel = new St.Label({
            text: '无视频标题',
            style_class: 'cream-island-media-title'
        });
        this._artistLabel = new St.Label({
            text: '哔哩哔哩桌面客户端',
            style_class: 'cream-island-media-artist'
        });
        textCol.add_child(this._titleLabel);
        textCol.add_child(this._artistLabel);
        mediaInfoRow.add_child(textCol);
        this._playerCard.add_child(mediaInfoRow);

        // Progress row
        this._progressBox = new St.BoxLayout({
            vertical: false,
            visible: false,
            margin_bottom: 8
        });
        this._posLabel = new St.Label({
            text: '00:00',
            style_class: 'cream-island-subtitle'
        });
        this._durLabel = new St.Label({
            text: ' / 00:00',
            style_class: 'cream-island-subtitle'
        });
        this._progressBox.add_child(this._posLabel);
        this._progressBox.add_child(this._durLabel);
        this._playerCard.add_child(this._progressBox);

        // Control buttons
        this._controlsRow = new St.BoxLayout({
            vertical: false,
            style_class: 'cream-island-media-controls',
            x_align: Clutter.ActorAlign.CENTER
        });

        this._prevBtn = new St.Button({
            label: '⏮ 上一个',
            style_class: 'cream-island-btn',
            visible: false
        });
        this._prevBtn.connect('clicked', () => this._sendPlayerCommand('Previous'));
        this._controlsRow.add_child(this._prevBtn);

        this._playPauseBtn = new St.Button({
            label: '▶ 播放',
            style_class: 'cream-island-btn-accent'
        });
        this._playPauseBtn.connect('clicked', () => this._sendPlayerCommand('PlayPause'));
        this._controlsRow.add_child(this._playPauseBtn);

        this._nextBtn = new St.Button({
            label: '⏭ 下一个',
            style_class: 'cream-island-btn',
            visible: false
        });
        this._nextBtn.connect('clicked', () => this._sendPlayerCommand('Next'));
        this._controlsRow.add_child(this._nextBtn);

        this._focusBtn = new St.Button({
            label: '🪟 聚焦窗口',
            style_class: 'cream-island-btn'
        });
        this._focusBtn.connect('clicked', () => this._activateBilibiliApp());
        this._controlsRow.add_child(this._focusBtn);

        this._playerCard.add_child(this._controlsRow);

        // Empty state container (shown when client not running or no media active)
        this._emptyBox = new St.BoxLayout({
            vertical: true,
            style_class: 'cream-island-card-inner',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'padding-top: 20px; padding-bottom: 20px;'
        });

        let emptyIcon = new St.Icon({
            icon_name: 'io.github.msojocs.bilibili',
            icon_size: 56,
            style_class: 'cream-island-media-app-icon',
            margin_bottom: 8
        });
        this._emptyBox.add_child(emptyIcon);

        this._emptyTitleLabel = new St.Label({
            text: '哔哩哔哩 (桌面客户端)',
            style_class: 'cream-island-title',
            margin_bottom: 4
        });
        this._emptyBox.add_child(this._emptyTitleLabel);

        this._emptyDescLabel = new St.Label({
            text: '客户端未运行或暂无播放内容',
            style_class: 'cream-island-subtitle',
            margin_bottom: 12
        });
        this._emptyBox.add_child(this._emptyDescLabel);

        let launchBtn = new St.Button({
            label: '▶ 打开哔哩哔哩桌面客户端',
            style_class: 'cream-island-btn-accent'
        });
        launchBtn.connect('clicked', () => this._activateBilibiliApp());
        this._emptyBox.add_child(launchBtn);

        this.add_child(this._emptyBox);
    }


    setActive(active) {
        this._active = active;
        if (active) this._renderSnapshot(this._service.getSnapshot());
        this._service.setPositionVisible(active);
    }
    _renderSnapshot(snapshot) {
        this._statusBadge.text = snapshot.connected ? (snapshot.playing ? '正在播放' : '已暂停 / 就绪') : '未连接';
        this._playerCard.visible = snapshot.connected;
        this._emptyBox.visible = !snapshot.connected;
        this._titleLabel.text = snapshot.title || '暂无播放内容';
        this._artistLabel.text = snapshot.artist || '哔哩哔哩桌面客户端';
        this._playPauseBtn.label = snapshot.playing ? '暂停' : '播放';
        this._prevBtn.visible = Boolean(snapshot.previous);
        this._nextBtn.visible = Boolean(snapshot.next);
        this._progressBox.visible = snapshot.length > 0;
        this._posLabel.text = MprisUtil.formatSeconds(Math.floor((snapshot.position || 0) / 1000000));
        this._durLabel.text = ' / ' + MprisUtil.formatSeconds(Math.floor((snapshot.length || 0) / 1000000));
    }
    _sendPlayerCommand(command) { this._service.command(command); }
    _activateBilibiliApp() {
        try {
            let appSys = Shell.AppSystem.get_default();
            let app = appSys.lookup_app('io.github.msojocs.bilibili.desktop');
            if (app) {
                app.activate();
            } else {
                let appInfo = Gio.DesktopAppInfo.new('io.github.msojocs.bilibili.desktop');
                if (appInfo) {
                    appInfo.launch([], null);
                }
            }
        } catch (e) {
            log('[CreamIsland] Failed to activate Bilibili client: ' + e);
        }
    }


    destroy() {
        this.setActive(false); this._unsubscribe(); super.destroy();
    }
});

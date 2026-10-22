/* modules/wallpaperView.js
 * Wallpaper switcher with reversible original settings backup,
 * asynchronous directory enumeration, and visible status feedback.
 */

const { Clutter, Gio, GLib, GObject, St } = imports.gi;

const Batch = imports.misc.extensionUtils.getCurrentExtension().imports.modules.batch.Batch;
var WallpaperView = GObject.registerClass(class WallpaperView extends St.BoxLayout {
    _init(config) {
        super._init({
            vertical: true,
            style_class: 'cream-island-card'
        });

        this._config = config;
        this._bgSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });

        // Save original wallpaper URI if not already saved
        let origUri = this._config.getString('original-wallpaper-uri', '');
        let curUri = this._bgSettings.get_string('picture-uri');
        if (!origUri || origUri === '') {
            this._config.setString('original-wallpaper-uri', curUri);
        }

        this._wallpapers = [];this._cancel=new Gio.Cancellable();
        this._batch = new Batch(cb=>GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,()=>{cb();return GLib.SOURCE_REMOVE;}),id=>GLib.source_remove(id),6);
        this._active=false;this._dirty=true;this._dead=false;
        this._buildUI();
        this._loadWallpapersAsync();
    }

    _buildUI() {
        // Header
        let headerRow = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });
        let title = new St.Label({
            text: '壁纸切换',
            style_class: 'cream-island-title',
            x_expand: true
        });
        headerRow.add_child(title);

        let restoreBtn = new St.Button({
            label: '恢复初始壁纸',
            style_class: 'cream-island-btn'
        });
        restoreBtn.connect('clicked', () => this._restoreOriginal());
        headerRow.add_child(restoreBtn);
        this.add_child(headerRow);

        // Current status label
        this._currentLabel = new St.Label({
            text: '',
            style_class: 'cream-island-subtitle'
        });
        this.add_child(this._currentLabel);
        this._updateCurrentLabel();

        // Scroll Area for Wallpapers
        this._scrollView = new St.ScrollView({
            style_class: 'cream-island-card',
            x_expand: true,
            y_expand: true
        });
        this._listContainer = new St.BoxLayout({
            vertical: true
        });
        this._scrollView.add_actor(this._listContainer);
        this.add_child(this._scrollView);
    }

    _updateCurrentLabel(extraNotice) {
        let curUri = this._bgSettings.get_string('picture-uri');
        let unescaped = GLib.uri_unescape_string(curUri, null) || curUri;
        let basename = GLib.path_get_basename(unescaped.replace('file://', ''));
        if (extraNotice) {
            this._currentLabel.set_text(`当前壁纸：${basename} (${extraNotice})`);
        } else {
            this._currentLabel.set_text(`当前壁纸：${basename}`);
        }
    }

    _loadWallpapersAsync() {
        this._wallpapers = [];this._cancel=new Gio.Cancellable();
        let dirs = [
            GLib.build_filenamev([GLib.get_home_dir(), 'Pictures', '壁纸']),
            '/usr/share/backgrounds'
        ];

        let pendingDirs = dirs.length;

        dirs.forEach(dirPath => {
            let file = Gio.File.new_for_path(dirPath);
            if (!file.query_exists(null)) {
                pendingDirs--;
                if (pendingDirs === 0) this._renderWallpaperList();
                return;
            }

            file.enumerate_children_async(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                this._cancel,
                (f, res) => {
                    if(this._dead)return;
                    try {
                        let enumerator = f.enumerate_children_finish(res);
                        const next=()=>enumerator.next_files_async(24,GLib.PRIORITY_DEFAULT,this._cancel,(en,result)=>{
                            if(this._dead)return;
                            try {
                                let infos=en.next_files_finish(result);
                                infos.forEach(info=>{
                                    let name=info.get_name();
                                    if(/\.(jpg|png|jpeg)$/i.test(name)){
                                        let path=GLib.build_filenamev([dirPath,name]);
                                        this._wallpapers.push({name:name,path:path,uri:Gio.File.new_for_path(path).get_uri()});
                                    }
                                });
                                if(infos.length){next();return;}
                            }catch(e){}
                            en.close_async(GLib.PRIORITY_DEFAULT,null,()=>{});
                            pendingDirs--;if(!pendingDirs)this._renderWallpaperList();
                        });next();
                        return;
                    } catch (e) {
                        log('[CreamIsland] Error scanning wallpapers in ' + dirPath + ': ' + e);
                        pendingDirs--; if(!pendingDirs)this._renderWallpaperList();
                    }
                }
            );
        });
    }

    _renderWallpaperList() {
        this._dirty=true;if(this._dead||!this._active)return;
        this._batch.stop(); this._listContainer.destroy_all_children();

        if (this._wallpapers.length === 0) {
            let empty = new St.Label({
                text: '未扫描到可用壁纸图片',
                style_class: 'cream-island-subtitle'
            });
            this._listContainer.add_child(empty);
            return;
        }

        let curUri = this._bgSettings.get_string('picture-uri');

        this._batch.run(this._wallpapers, wp => {
            let isCurrent = (curUri === wp.uri || curUri.includes(encodeURIComponent(wp.name)));

            let btn = new St.Button({
                style_class: 'cream-island-app-item',
                x_expand: true
            });
            if (isCurrent) {
                btn.add_style_class_name('selected');
            }

            let row = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });

            let icon = new St.Icon({
                icon_name: 'image-x-generic-symbolic',
                style_class: 'cream-island-slider-icon'
            });
            row.add_child(icon);

            let nameLbl = new St.Label({
                text: wp.name,
                style_class: 'cream-island-notif-title',
                x_expand: true
            });
            row.add_child(nameLbl);

            if (isCurrent) {
                let curBadge = new St.Label({
                    text: '已应用',
                    style_class: 'cream-island-capsule-badge'
                });
                row.add_child(curBadge);
            } else {
                let applyBtn = new St.Label({
                    text: '点击应用',
                    style_class: 'cream-island-subtitle'
                });
                row.add_child(applyBtn);
            }

            btn.set_child(row);
            btn.connect('clicked', () => this._applyWallpaper(wp.uri));
            this._listContainer.add_child(btn);
        },()=>{this._dirty=false;});
    }

    _applyWallpaper(uri) {
        try {
            let ok = this._bgSettings.set_string('picture-uri', uri);
            if (ok) {
                this._updateCurrentLabel('设置成功');
            } else {
                this._updateCurrentLabel('设置失败');
            }
            this._renderWallpaperList();
        } catch (e) {
            this._updateCurrentLabel('设置出错');
            log('[CreamIsland] Failed to apply wallpaper: ' + e);
        }
    }

    _restoreOriginal() {
        let origUri = this._config.getString('original-wallpaper-uri', '');
        if (origUri && origUri !== '') {
            this._applyWallpaper(origUri);
        } else {
            this._updateCurrentLabel('未找到初始壁纸备份');
        }
    }
    setActive(active) {this._active=active;if(!active)this._batch.stop();else if(this._dirty)this._renderWallpaperList();}
    destroy(){this._dead=true;if(this._cancel)this._cancel.cancel();this._batch.destroy();super.destroy();}

});

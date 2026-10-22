/* modules/launcher.js
 * Application launcher using system desktop application index (Shell.AppSystem).
 * Supports fuzzy name search, keyboard navigation (Up/Down/Enter), and safe launching.
 */

const { Clutter, Gio, GLib, GObject, Shell, St } = imports.gi;

const Batch = imports.misc.extensionUtils.getCurrentExtension().imports.modules.batch.Batch;
var AppLauncherView = GObject.registerClass({
    Signals: {
        'app-launched': {}
    }
}, class AppLauncherView extends St.BoxLayout {
    _init() {
        super._init({
            vertical: true,
            style_class: 'cream-island-card'
        });

        this._appSys = Shell.AppSystem.get_default();
        this._allApps = [];
        this._filteredApps = [];
        this._selectedIndex = 0;
        this._appButtons = [];

        this._batch = new Batch(cb=>GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,()=>{cb();return GLib.SOURCE_REMOVE;}),id=>GLib.source_remove(id),6);
        this._active=false;this._dirty=true;this._dead=false;
        this._buildUI();
        this._loadInstalledApps();
    }

    _buildUI() {
        // Search Entry
        let searchBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });
        let searchIcon = new St.Icon({
            icon_name: 'edit-find-symbolic',
            style_class: 'cream-island-slider-icon'
        });
        searchBox.add_child(searchIcon);

        this._searchEntry = new St.Entry({
            hint_text: '搜索应用程序 (支持拼音 / 英文 / 中文)...',
            style_class: 'cream-island-entry',
            can_focus: true,
            x_expand: true
        });
        this._searchEntry.clutter_text.connect('text-changed', () => this._onSearchChanged());
        this._searchEntry.clutter_text.connect('key-press-event', (actor, event) => this._onKeyPress(event));
        searchBox.add_child(this._searchEntry);
        this.add_child(searchBox);

        // App List Scroll Area
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

    _loadInstalledApps() {
        let apps = this._appSys.get_installed();
        this._allApps = apps.filter(app => {
            let id = app.get_id();
            return id && !app.get_app_info().should_show() === false;
        }).sort((a, b) => a.get_name().localeCompare(b.get_name(), 'zh-CN'));

        this._filterApps('');
    }

    _onSearchChanged() {
        let query = this._searchEntry.get_text().trim().toLowerCase();
        this._filterApps(query);
    }

    _filterApps(query) {
        if (!query) {
            this._filteredApps = this._allApps.slice(0, 40);
        } else {
            this._filteredApps = this._allApps.filter(app => {
                let name = app.get_name().toLowerCase();
                let desc = (app.get_description() || '').toLowerCase();
                let id = app.get_id().toLowerCase();
                return name.includes(query) || desc.includes(query) || id.includes(query);
            }).slice(0, 40);
        }

        this._selectedIndex = 0;
        this._renderList();
    }

    _renderList() {
        this._dirty=true;if(this._dead||!this._active)return;
        this._batch.stop(); this._listContainer.destroy_all_children();
        this._appButtons = [];

        if (this._filteredApps.length === 0) {
            let emptyLabel = new St.Label({
                text: '未找到匹配的应用',
                style_class: 'cream-island-subtitle',
                x_align: Clutter.ActorAlign.CENTER,
                margin_top: 20,
                margin_bottom: 20
            });
            this._listContainer.add_child(emptyLabel);
            return;
        }

        this._batch.run(this._filteredApps, (app, idx) => {
            let btn = new St.Button({
                style_class: 'cream-island-app-item',
                reactive: true,
                x_expand: true
            });

            if (idx === this._selectedIndex) {
                btn.add_style_class_name('selected');
            }

            let row = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });

            // App Icon
            let iconActor = app.create_icon_texture(28);
            if (iconActor) {
                row.add_child(iconActor);
            }

            // Names
            let textCol = new St.BoxLayout({ vertical: true });
            let nameLbl = new St.Label({
                text: app.get_name(),
                style_class: 'cream-island-notif-title'
            });
            textCol.add_child(nameLbl);

            let descText = app.get_description();
            if (descText) {
                let descLbl = new St.Label({
                    text: descText,
                    style_class: 'cream-island-subtitle'
                });
                textCol.add_child(descLbl);
            }
            row.add_child(textCol);
            btn.set_child(row);

            btn.connect('clicked', () => this._launchApp(app));
            this._listContainer.add_child(btn);
            this._appButtons.push(btn);
        },()=>{this._dirty=false;});
    }

    _onKeyPress(event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Down) {
            if (this._selectedIndex < this._filteredApps.length - 1) {
                this._selectedIndex++;
                this._updateSelectionStyle();
            }
            return Clutter.EVENT_STOP;
        } else if (symbol === Clutter.KEY_Up) {
            if (this._selectedIndex > 0) {
                this._selectedIndex--;
                this._updateSelectionStyle();
            }
            return Clutter.EVENT_STOP;
        } else if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            if (this._filteredApps.length > this._selectedIndex) {
                this._launchApp(this._filteredApps[this._selectedIndex]);
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _updateSelectionStyle() {
        this._appButtons.forEach((btn, idx) => {
            if (idx === this._selectedIndex) {
                btn.add_style_class_name('selected');
            } else {
                btn.remove_style_class_name('selected');
            }
        });
    }

    _launchApp(app) {
        try {
            app.open_new_window(-1);
            this.emit('app-launched');
        } catch (e) {
            log('[CreamIsland] Failed to launch app ' + app.get_name() + ': ' + e);
        }
    }
    setActive(active) {this._active=active;if(!active)this._batch.stop();else if(this._dirty)this._renderList();}
    destroy(){this._dead=true;if(this._cancel)this._cancel.cancel();this._batch.destroy();super.destroy();}

});

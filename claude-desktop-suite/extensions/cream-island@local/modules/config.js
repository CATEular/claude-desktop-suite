/* modules/config.js
 * GSettings wrapper supporting both locally compiled schemas and installed schemas.
 * Includes automated migration to ensure robust baseline dimensions.
 */

const { Gio, GLib } = imports.gi;

var Config = class Config {
    constructor(extension) {
        this._extension = extension;
        this._settings = this._initSettings();
        this.migrateDimensions();
    }

    _initSettings() {
        let schemaId = 'org.gnome.shell.extensions.cream-island';
        try {
            let schemaDir = this._extension.dir.get_child('schemas');
            if (schemaDir.query_exists(null)) {
                let schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                    schemaDir.get_path(),
                    Gio.SettingsSchemaSource.get_default(),
                    false
                );
                let schemaObj = schemaSource.lookup(schemaId, true);
                if (schemaObj) {
                    return new Gio.Settings({ settings_schema: schemaObj });
                }
            }
        } catch (e) {
            log('[CreamIsland] Local schema loading failed: ' + e);
        }

        try {
            let defaultSource = Gio.SettingsSchemaSource.get_default();
            if (defaultSource.lookup(schemaId, true)) {
                return new Gio.Settings({ schema_id: schemaId });
            }
        } catch (e) {}

        return null;
    }

    migrateDimensions() {
        if (!this._settings) return;
        try {
            let policy = this._extension.imports.modules.appearance;
            let changes = policy.migration(this._settings.get_int('layout-version'),
                this._settings.get_int('capsule-width'),
                this._settings.get_int('capsule-height'),
                this._settings.get_int('glass-opacity'));
            Object.keys(changes).filter(key => key !== 'layout-version').forEach(key =>
                this._settings.set_int(key, changes[key]));
            if (changes['layout-version']) this._settings.set_int('layout-version', 3);
        } catch (e) { log('[CreamIsland] Layout migration: ' + e); }
    }

    getSettings() {
        return this._settings;
    }

    getString(key, defVal) {
        if (!this._settings) return defVal;
        try {
            let val = this._settings.get_string(key);
            if (key === 'left-click-action' && (!val || ['overview','calendar'].includes(val))) {
                return 'notifications';
            }
            return val;
        } catch (e) {
            return defVal;
        }
    }

    setString(key, val) {
        if (!this._settings) return false;
        try {
            return this._settings.set_string(key, val);
        } catch (e) {
            return false;
        }
    }

    getBoolean(key, defVal) {
        if (!this._settings) return defVal;
        try {
            return this._settings.get_boolean(key);
        } catch (e) {
            return defVal;
        }
    }

    setBoolean(key, val) {
        if (!this._settings) return false;
        try {
            return this._settings.set_boolean(key, val);
        } catch (e) {
            return false;
        }
    }

    getInt(key, defVal) {
        if (!this._settings) return defVal;
        try {
            let val = this._settings.get_int(key);
            return val;
        } catch (e) {
            return defVal;
        }
    }

    setInt(key, val) {
        if (!this._settings) return false;
        try {
            return this._settings.set_int(key, val);
        } catch (e) {
            return false;
        }
    }
};

// Memory backend only: never writes the user's dconf or contacts session DBus.
const { Gio, GLib } = imports.gi;
if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') throw new Error('Requires memory backend');
imports.searchPath.unshift('.');
const A = imports.modules.appearance;
const Config = imports.modules.config.Config;
function check(value, message) { if (!value) throw new Error(message); }
let source = Gio.SettingsSchemaSource.new_from_directory(GLib.build_filenamev([GLib.get_current_dir(), 'schemas']), Gio.SettingsSchemaSource.get_default(), false);
let schema = source.lookup('org.gnome.shell.extensions.cream-island', false);
let settings = new Gio.Settings({ settings_schema: schema });
settings.set_int('capsule-width', 640);
settings.set_int('capsule-height', 68);
settings.set_int('glass-opacity', 80);
let extension = { dir: Gio.File.new_for_path(GLib.get_current_dir()), imports: { modules: { appearance: A } } };
let config = new Config(extension);
check(settings.get_int('capsule-width') === 400, 'old forced width migrated');
check(settings.get_int('capsule-height') === 54, 'old height migrated');
check(settings.get_int('glass-opacity') === 89, 'old default opacity migrated');
check(settings.get_int('layout-version') === 3, 'migration marked');
config.setInt('capsule-width', 280);
config.setInt('capsule-top-margin', 0);
config.setString('original-wallpaper-uri', 'file:///test/wallpaper');
config.setBoolean('capsule-show-media-ticker', false);
check(settings.get_int('capsule-width') === 280 && config.getInt('capsule-width', 400) === 280, 'user narrow width persists without clamps');
check(settings.get_int('capsule-top-margin') === 0, 'zero margin preserved');
check(settings.get_string('original-wallpaper-uri') === 'file:///test/wallpaper', 'setString not left in delayed apply mode');
check(!settings.get_boolean('capsule-show-media-ticker'), 'setBoolean propagates');
config.setInt('capsule-width', 640);
new Config(extension);
check(settings.get_int('capsule-width') === 640, 'migration runs once; later custom 640 preserved');
let custom = A.migration(0, 310, 48, 94);
check(!('capsule-width' in custom) && !('capsule-height' in custom) && !('glass-opacity' in custom), 'nonhistorical custom settings preserved');
let capsule = A.glassStyle(89, false), panel = A.glassStyle(89, true);
check(capsule.includes('0.890') && panel.includes('1.000'), 'capsule honors opacity, popup is opaque for clear text');
check(A.glassStyle(75, false) !== capsule, 'opacity slider changes actual generated style');
check(capsule.includes('background-gradient-start:') && capsule.includes('background-gradient-end:'), 'St gradient applied');
check(!capsule.includes('opacity:'), 'text actor opacity never reduced');

function actor() { return { style: '', writes: 0,
    get_style() { return this.style; },
    set_style(value) { this.style = value; this.writes++; } }; }
let capActor = actor(), panelActor = actor();
A.applyGlass(89, capActor, panelActor);
check(capActor.style === capsule && panelActor.style === panel, 'production applyGlass writes generated styles to actors');
A.applyGlass(89, capActor, panelActor);
check(capActor.writes === 1, 'same appearance does not trigger recursive style changes');
A.applyGlass(75, capActor, panelActor);
check(capActor.writes === 2 && capActor.style.includes('0.750') && panelActor.style.includes('1.000'), 'changed opacity applied to both actual style targets');

print('Production config/appearance passed: memory Gio.Settings migration, later writes, custom width, opacity style.');

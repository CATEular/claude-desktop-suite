/* Read actual installed GNOME 3.36 GI metadata without constructing actors or
 * connecting a display/session. Import St first to select Shell's Mutter GI. */
imports.gi.versions.Clutter = '6';
const St = imports.gi.St;
const { Gio, GLib, GIRepository, Clutter, GObject, Meta, Shell, Pango } = imports.gi;
const ByteArray = imports.byteArray;
const namespaces = { St, Gio, GLib, Clutter, GObject, Meta, Shell, Pango };
const repository = GIRepository.Repository.get_default();
function check(value, message) { if (!value) throw new Error(message); }
function incompatibilities(source) {
    let missing = [], pattern = /\bnew\s+(St|Gio|GLib|Clutter|GObject|Meta|Shell|Pango)\.([A-Za-z_][A-Za-z_0-9]*)\s*\(/g;
    let match;
    while ((match = pattern.exec(source))) {
        let namespace = namespaces[match[1]], symbol = match[2];
        // GI namespaces are lazy: Object.keys omits unaccessed constructors.
        // Look up their actual typelib entry before touching the namespace.
        if (!repository.find_by_name(match[1], symbol) || typeof namespace[symbol] !== 'function')
            missing.push(match[1] + '.' + symbol);
    }
    return missing;
}
let files = ['extension.js'];
let directory = Gio.File.new_for_path('modules');
let entries = directory.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null), info;
while ((info = entries.next_file(null))) if (info.get_name().endsWith('.js')) files.push('modules/' + info.get_name());
entries.close(null);
let constructors = 0;
files.forEach(path => {
    let [ok, bytes] = GLib.file_get_contents(path);
    check(ok, 'read production ' + path);
    let source = ByteArray.toString(bytes), missing = incompatibilities(source);
    check(!missing.length, path + ': GI constructors absent from installed Shell typelibs: ' + missing.join(', '));
    constructors += (source.match(/\bnew\s+(?:St|Gio|GLib|Clutter|GObject|Meta|Shell|Pango)\./g) || []).length;
});
check(incompatibilities('new Clutter.Point({x: 0.5, y: 0.5})').includes('Clutter.Point'),
    'negative regression: unavailable Clutter.Point is rejected');
for (let [name, type, methods] of [
    ['Clutter.Actor', Clutter.Actor, ['set_pivot_point', 'set_size', 'set_position', 'destroy_all_children']],
    ['Clutter.GridLayout', Clutter.GridLayout, ['attach']],
    ['St.ThemeNode', St.ThemeNode, ['adjust_for_width', 'adjust_preferred_height', 'adjust_preferred_width']]
]) methods.forEach(method => check(typeof type.prototype[method] === 'function', name + '.' + method + ' missing'));
for (let [namespace, type, required] of [
    ['Clutter', 'GridLayout', ['column-homogeneous', 'row-homogeneous']],
    ['St', 'Settings', ['enable-animations']]
]) {
    let object = repository.find_by_name(namespace, type), properties = [];
    for (let i=0; i<GIRepository.object_info_get_n_properties(object); i++)
        properties.push(GIRepository.object_info_get_property(object, i).get_name());
    required.forEach(property => check(properties.includes(property), namespace + '.' + type + ':' + property + ' missing'));
}
print('Actual Shell/Mutter GI compatibility passed: ' + constructors + ' production constructor references; pivot/grid/theme APIs and negative Point regression. No actors/display created.');
const Gvc=imports.gi.Gvc;
check(Gvc.MixerControlState.READY===1,'Gvc READY enum');
['get_source_outputs','get_default_source','get_state'].forEach(name=>check(typeof Gvc.MixerControl.prototype[name]==='function','Gvc control '+name));
['get_application_id','get_id','get_index','get_state'].forEach(name=>check(typeof Gvc.MixerStream.prototype[name]==='function','Gvc stream '+name));
check(typeof Gio.DataInputStream.prototype.read_line_finish_utf8==='function','async UTF8 helper reader');

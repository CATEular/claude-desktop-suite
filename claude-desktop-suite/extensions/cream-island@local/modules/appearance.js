/* Shared, side-effect-free appearance and one-time migration policy. */
var migration = function(version, width, height, opacity) {
    if (version >= 3) return {};
    let changes = { 'layout-version': 3 };
    // Only exact historical forced/default values are reset. Subsequent user
    // choices, including 640, are preserved once layout-version reaches 3.
    if (width === 640) changes['capsule-width'] = 400;
    if (height === 68) changes['capsule-height'] = 54;
    if (opacity === 80) changes['glass-opacity'] = 89;
    return changes;
};
var glassStyle = function(percent, panel) {
    let alpha = Math.max(0.60, Math.min(0.98, percent / 100));
    if (panel) alpha = 1;
    let a = alpha.toFixed(3);
    // St-native gradient only: does not blur, refract or sample the desktop.
    return 'background-color: rgba(15,15,18,' + a + '); ' +
        'background-gradient-direction: vertical; ' +
        'background-gradient-start: rgba(37,37,42,' + a + '); ' +
        'background-gradient-end: rgba(12,12,16,' + a + ');';
};
var applyGlass = function(percent, capsule, panel) {
    [[capsule, false], [panel, true]].forEach(([actor, isPanel]) => {
        if (!actor) return;
        let style = glassStyle(percent, isPanel);
        if (actor.get_style() !== style) actor.set_style(style);
    });
};

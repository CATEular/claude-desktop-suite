/* Pure policy shared by the Shell extension and its display-free checks. */
var DEFAULTS = {
    version: 1,
    originalWallpaper: '',
    wallpapers: [],
    workspaceWallpapersEnabled: true,
    sidebarHoverEnabled: true,
    // null means all workspaces, [] means none; numbers are one-based.
    sidebarWorkspaces: null,
    sidebarRestAngle: 52,
    sidebarHoverPadding: 14,
    sidebarCloseDelay: 350,
    animationDuration: 260,
    topbarHoverEnabled: true,
};

function bounded(value, fallback, minimum, maximum) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function normalizeConfig(raw) {
    raw = Object.assign({}, DEFAULTS, raw && typeof raw === 'object' ? raw : {});
    let config = Object.assign({}, raw);
    for (let key of ['workspaceWallpapersEnabled', 'sidebarHoverEnabled', 'topbarHoverEnabled'])
        config[key] = typeof raw[key] === 'boolean' ? raw[key] : DEFAULTS[key];
    config.originalWallpaper = typeof raw.originalWallpaper === 'string' ? raw.originalWallpaper : '';
    config.wallpapers = Array.isArray(raw.wallpapers)
        ? raw.wallpapers.slice(0, 16).map(uri => typeof uri === 'string' && uri ? uri : null) : [];
    config.sidebarRestAngle = bounded(raw.sidebarRestAngle, 52, 20, 72);
    config.sidebarHoverPadding = bounded(raw.sidebarHoverPadding, 14, 0, 60);
    config.sidebarCloseDelay = bounded(raw.sidebarCloseDelay, 350, 100, 2000);
    config.animationDuration = bounded(raw.animationDuration, 260, 80, 700);
    config.sidebarWorkspaces = Array.isArray(raw.sidebarWorkspaces)
        ? Array.from(new Set(raw.sidebarWorkspaces.filter(number =>
            Number.isInteger(number) && number >= 1 && number <= 16))).sort((a, b) => a - b)
        : null;
    return config;
}

function sidebarOnWorkspace(config, index) {
    return config.sidebarWorkspaces === null || config.sidebarWorkspaces.includes(index + 1);
}

function wallpaperForWorkspace(config, index, fallback) {
    return config.wallpapers[index] || config.originalWallpaper || fallback;
}

function isDesktopWidget(title) {
    return ['ClaudeDesktop-System', 'ClaudeDesktop-Processes', 'Desktop_Interactive_Widgets'].includes(title);
}

function unionRect(rects) {
    if (!rects.length)
        return null;
    let x = Math.min(...rects.map(rect => rect.x));
    let y = Math.min(...rects.map(rect => rect.y));
    let right = Math.max(...rects.map(rect => rect.x + rect.width));
    let bottom = Math.max(...rects.map(rect => rect.y + rect.height));
    return { x, y, width: right - x, height: bottom - y };
}

function containsPoint(rect, x, y, padding) {
    return rect !== null && x >= rect.x - padding && y >= rect.y - padding &&
        x <= rect.x + rect.width + padding && y <= rect.y + rect.height + padding;
}

function shouldExpand(inside, now, lastInside, closeDelay) {
    return inside || (lastInside !== null && now - lastInside < closeDelay);
}

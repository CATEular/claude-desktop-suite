/* All arguments/results are stage coordinates except explicitly logical settings.
 * Text/theme preferred dimensions have already been scaled by St. */
var PANEL_WIDTH = 580;
var panelGeometry = function(monitor, scale, anchorBottom, naturalHeight) {
    let width = Math.min(PANEL_WIDTH * scale, Math.max(1, monitor.width - 32 * scale));
    let y = anchorBottom + 8 * scale;
    return { width: width, x: monitor.x + Math.floor((monitor.width - width) / 2),
        y: y, height: Math.min(naturalHeight,
            Math.max(1, monitor.y + monitor.height - 16 * scale - y)) };
};

var timerProgress = function(remaining, total) {
    return total > 0 ? Math.max(0, Math.min(1, (total - remaining) / total)) : 0;
};
// Symmetric center allocation leaves both native side boxes their natural room.
var topBarBudget = function(panelWidth, scale, leftWidth, rightWidth, maximumLogical = 280) {
    return Math.max(1, Math.min(maximumLogical * scale,
        panelWidth - 2 * Math.max(leftWidth, rightWidth) - 24 * scale));
};
var fitThumbnail = function(width, height, maxWidth, maxHeight) {
    let ratio = Math.min(maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
    return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
};

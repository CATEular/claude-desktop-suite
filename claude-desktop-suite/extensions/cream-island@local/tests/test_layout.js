imports.searchPath.unshift('.');
const L = imports.modules.layout;
function check(value, message) { if (!value) throw new Error(message); }
for (let scale of [1, 2]) {
    let monitor = { x: 100, y: 80, width: 4096, height: 2560 };
    let barBottom = monitor.y + 28 * scale;
    let popup = L.panelGeometry(monitor, scale, barBottom, 900 * scale);
    check(popup.y === barBottom + 8 * scale, 'popup follows existing native bar bottom');
    check(popup.width === 580 * scale, 'single bounded popup width');
    check(popup.y + popup.height <= monitor.y + monitor.height - 16 * scale, 'popup fits display');
    let small = { x: -1280, y: 200, width: 800, height: 600 };
    popup = L.panelGeometry(small, scale, 350, 5000);
    check(popup.width === Math.min(L.PANEL_WIDTH * scale, small.width - 32 * scale), 'small display bounded');
    check(popup.x >= small.x && popup.x + popup.width <= small.x + small.width, 'offset monitor origin');
    check(popup.y + popup.height <= small.y + small.height, 'scroll height bounded');
}
check(L.timerProgress(300, 300) === 0 && L.timerProgress(150, 300) === 0.5, 'ring uses actual remaining/total');
check(L.timerProgress(0, 300) === 1 && L.timerProgress(10, 0) === 0, 'completed and empty ring bounded');
check(L.topBarBudget(1920, 1, 400, 500) === 280, 'native banner cap');
check(L.topBarBudget(1200, 2, 300, 350) === 452, 'banner leaves symmetric tray room');
check(L.topBarBudget(800, 2, 380, 380) === 1, 'no overlap when native trays consume available width');
print('Production geometry passed: native bar budget, popup screen bounds, offset monitors and ring progress.');

for(let size of [[1920,1080],[800,1200],[3840,1600]]) {
    let fit=L.fitThumbnail(size[0],size[1],384,240);
    check(fit.width<=384&&fit.height<=240&&Math.abs(fit.width/fit.height-size[0]/size[1])<0.02,
        'workspace thumbnail fits scale2 bounds without stretching source aspect ratio');
}

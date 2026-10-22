// Execute the actual extension entry point with inert Shell adapters. No bus,
// actors or desktop are created. Checks the error path syntax tests missed.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync('extension.js', 'utf8');
function exercise(failure) {
    const error = new Error('injected ' + failure);
    const count = { add: 0, remove: 0, destroyed: 0 };
    class Actor {
        constructor() { this.visible = true; this.container = { visible: true }; this.style = ''; }
        connect() { return 1; } disconnect() {} hide() { this.visible = false; }
        destroy() { count.destroyed++; } get_style() { return this.style; } set_style(style) { this.style = style; }
        setPopup() {} updateClock() {} updateTimer() {} updateMic() {} updateLevel() {} setLocked() {} updateAppearance() {} refreshBounds() {} render() {}
    }
    class Service extends Actor {
        subscribeTicker() { return () => {}; } subscribeIncoming() { return () => {}; }
        subscribePrivacy() { return () => {}; } getSnapshot() { return { title: '', playing: false }; }
        getState(){return {active:false};}
        start() { return Promise.resolve(); }
    }
    class Capsule extends Actor { constructor() { super(); if (failure === 'capsule') throw error; } }
    class State extends Actor { privacy() { if (failure === 'after-registration') throw error; } }
    class Deferred extends Actor { request() {} push() {} }
    class Config { getSettings() { return new Actor(); } getInt(key, value) { return value; } getBoolean(key, value) { return value; } }
    let main = {
        panel: new Actor(), layoutManager: new Actor(), screenShield: null,
        wm: { addKeybinding() { if (failure === 'registration') throw error; count.add++; }, removeKeybinding() { count.remove++; } }
    };
    let clock = new Actor();
    main.panel.statusArea = { dateMenu: { container: clock } };
    main.panel.addToStatusArea = (role, actor) => { main.panel.statusArea[role] = actor; };
    main.layoutManager.addTopChrome = () => {}; main.layoutManager.removeChrome = () => {};
    let extension = { imports: { modules: {
        config: { Config }, storage: { Storage: Actor }, timerService: { TimerService: Service },
        micService:{MicService:Service}, mediaService: { MediaService: Service },
        notificationService: { NotificationService: Service, NativeBannerSuppressor: Actor },
        capsule: { CapsuleButton: Capsule }, islandState: { IslandState: State },
        panel: { IslandPanel: Actor }, appearance: { glassStyle: () => 'background-color: black;' },
        runtime: { LatestDelivery: Deferred, Coalescer: Deferred }
    } } };
    let context = vm.createContext({
        imports: { gi: { Clutter: {}, GLib: {}, Meta: { KeyBindingFlags: { NONE: 0 } },
            Shell: { ActionMode: { NORMAL: 1 } }, St: { ThemeContext: { get_for_stage: () => new Actor() } } },
            ui: { main }, misc: { extensionUtils: { getCurrentExtension: () => extension } } },
        global: { stage: {}, window_manager: new Actor() }, log() {}
    });
    vm.runInContext(source, context); vm.runInContext('init()', context);
    if (failure) {
        assert.throws(() => vm.runInContext('enable()', context), thrown => thrown === error,
            'enable must clean up and rethrow the original failure');
        assert.strictEqual(count.remove, failure === 'after-registration' ? 1 : 0,
            'removeKeybinding only runs after successful registration');
        vm.runInContext('disable()', context);
        assert.strictEqual(count.remove, failure === 'after-registration' ? 1 : 0, 'cleanup remains idempotent');
    } else {
        vm.runInContext('enable(); disable(); disable()', context);
        assert.strictEqual(count.add, 1); assert.strictEqual(count.remove, 1);
    }
    assert.strictEqual(clock.visible, true, 'native clock restored after cleanup');
}
exercise('capsule'); exercise('registration'); exercise('after-registration'); exercise(null);
console.log('Production enable lifecycle passed: original exception rethrown, partial cleanup, paired/idempotent keybinding unregister.');

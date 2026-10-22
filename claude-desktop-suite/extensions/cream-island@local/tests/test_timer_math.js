/* tests/test_timer_math.js
 * Unit test verifying production TimerService (modules/timerService.js)
 * covering input validation, countdown control, sleep recovery, atomic state persistence,
 * and duplicate notification prevention on reloads.
 */

const { GLib } = imports.gi;

imports.searchPath.unshift('.');
const StorageModule = imports.modules.storage;
const TimerServiceModule = imports.modules.timerService;

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runTimerTests() {
    print('--- Testing Production TimerService (modules/timerService.js) ---');

    let tmpDir = GLib.dir_make_tmp('cream_island_timer_test_XXXXXX');
    print('Isolated test directory: ' + tmpDir);

    try {
        let storage = new StorageModule.Storage(tmpDir);

        // 1. Test Strict Minute Input Validation
        let validInputs = ['1', '5', '15', '25', '45', '60', '1440'];
        validInputs.forEach(inp => {
            assert(TimerServiceModule.TimerService.validateMinutesString(inp) === true,
                `'${inp}' should be a valid minute input`);
        });

        let invalidInputs = ['0', '-1', '-25', '1abc', '10.5', '1.0', '1e2', '1441', '99999', '', '   ', 'one'];
        invalidInputs.forEach(inp => {
            assert(TimerServiceModule.TimerService.validateMinutesString(inp) === false,
                `'${inp}' should be strictly rejected as invalid minute input`);
        });

        // 2. Test TimerService Background Control (without UI view)
        let service = new TimerServiceModule.TimerService(storage);
        let initial = service.getState();
        assert(initial.active === false, 'Initial timer should be inactive');

        // Set preset 600s
        service.setPreset(600);
        let state1 = service.getState();
        assert(state1.totalSeconds === 600, 'totalSeconds should be 600');
        assert(state1.remainingSeconds === 600, 'remainingSeconds should be 600');
        assert(state1.active === false, 'active should be false before start');

        // Start
        service.toggleStartPause();
        let state2 = service.getState();
        assert(state2.active === true, 'Timer should be active after start');
        assert(state2.paused === false, 'Timer should not be paused');
        assert(state2.targetTimestamp > Date.now(), 'targetTimestamp should be in the future');

        // Pause
        service.toggleStartPause();
        let state3 = service.getState();
        assert(state3.active === true, 'Timer should still be active');
        assert(state3.paused === true, 'Timer should be paused');

        // Resume
        service.toggleStartPause();
        let state4 = service.getState();
        assert(state4.active === true, 'Timer should be active');
        assert(state4.paused === false, 'Timer should be unpaused');

        // Reset
        service.reset();
        let state5 = service.getState();
        assert(state5.active === false, 'Timer should be inactive after reset');
        assert(state5.remainingSeconds === 600, 'remainingSeconds should reset to total');
        service.destroy();

        // 3. Test Sleep / Overdue Recovery and Notification Triggering
        // Simulate a running timer that expired 30 seconds ago while computer was sleeping
        let expiredTimestamp = Date.now() - 30000;
        storage.saveTimerState({
            active: true,
            paused: false,
            targetTimestamp: expiredTimestamp,
            remainingSeconds: 60,
            totalSeconds: 60,
            notified: false
        });

        // Constructor executes _resumeOrValidateState() immediately upon startup
        let recoveredService = new TimerServiceModule.TimerService(storage);
        let recState = recoveredService.getState();
        assert(recState.active === false, 'Recovered overdue timer must become inactive');
        assert(recState.remainingSeconds === 0, 'remainingSeconds must be 0');
        assert(recState.notified === true, 'notified flag must be set to true');

        // Verify disk state was updated to prevent duplicate alerts on future boots
        let diskState = storage.getTimerState();
        assert(diskState.active === false, 'Disk state active must be false');
        assert(diskState.notified === true, 'Disk state notified must be true');

        // 4. Test Overdue Reload does NOT trigger duplicate notification
        let duplicateSignalFired = 0;
        let secondReloadService = new TimerServiceModule.TimerService(storage);
        secondReloadService.connect('completed', () => {
            duplicateSignalFired++;
        });
        secondReloadService._resumeOrValidateState();

        assert(duplicateSignalFired === 0, 'Duplicate notification MUST NOT fire on subsequent reload after completion');
        let secondState = secondReloadService.getState();
        assert(secondState.active === false, 'Second reload timer must remain inactive');
        assert(secondState.notified === true, 'Second reload notified flag must remain true');
        secondReloadService.destroy();
        recoveredService.destroy();

        // 5. Test Live Completion Signal
        let liveService = new TimerServiceModule.TimerService(storage);
        liveService.setPreset(1);
        let liveCompletedCount = 0;
        liveService.connect('completed', () => {
            liveCompletedCount++;
        });

        // Advance past target time and trigger tick
        liveService._state.active = true;
        liveService._state.paused = false;
        liveService._state.notified = false;
        liveService._state.targetTimestamp = Date.now() - 1000;
        liveService._resumeOrValidateState();

        assert(liveCompletedCount === 1, 'Live completion signal should fire exactly once');
        assert(liveService.getState().notified === true, 'Live completed timer must be marked notified');
        liveService.destroy();

        print('✓ Production TimerService tests PASSED with 100% real module execution.');
    } finally {
        GLib.spawn_command_line_sync(`rm -rf "${tmpDir}"`);
    }
}

runTimerTests();

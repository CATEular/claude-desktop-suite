/* tests/test_storage.js
 * Unit test verifying production Storage class (modules/storage.js)
 * running in an isolated temporary directory.
 */

const { GLib, Gio } = imports.gi;

imports.searchPath.unshift('.');
const StorageModule = imports.modules.storage;

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runStorageTests() {
    print('--- Testing Production Storage Class (modules/storage.js) ---');

    let tmpDir = GLib.dir_make_tmp('cream_island_storage_test_XXXXXX');
    print('Isolated test directory: ' + tmpDir);

    try {
        let storage = new StorageModule.Storage(tmpDir);

        // 1. Initially no notes
        assert(storage.getNoteForDate('2026-10-19') === '', 'Initial note should be empty string');
        assert(storage.hasNoteForDate('2026-10-19') === false, 'hasNoteForDate should be false');

        // 2. Save note
        let testNote = '集成测试：灵动岛原子存储持久化验证';
        storage.saveNoteForDate('2026-10-19', testNote);
        assert(storage.hasNoteForDate('2026-10-19') === true, 'hasNoteForDate should be true after saving');
        assert(storage.getNoteForDate('2026-10-19') === testNote, 'Note content should match');

        // 3. Test persistence from disk with a fresh instance on the same directory
        let freshStorage = new StorageModule.Storage(tmpDir);
        assert(freshStorage.getNoteForDate('2026-10-19') === testNote, 'Fresh instance must read saved note from disk');
        assert(freshStorage.hasNoteForDate('2026-10-19') === true, 'Fresh instance hasNoteForDate must be true');

        // 4. Update and clear note
        freshStorage.saveNoteForDate('2026-10-19', '');
        assert(freshStorage.hasNoteForDate('2026-10-19') === false, 'Empty note should be deleted');
        assert(freshStorage.getNoteForDate('2026-10-19') === '', 'Deleted note should return empty string');

        // 5. Test Timer State persistence
        let timerState = {
            active: true,
            paused: false,
            targetTimestamp: Date.now() + 1500 * 1000,
            remainingSeconds: 1500,
            totalSeconds: 1500,
            notified: false
        };
        let saveOk = freshStorage.saveTimerState(timerState);
        assert(saveOk === true, 'saveTimerState should return true');

        let thirdStorage = new StorageModule.Storage(tmpDir);
        let readState = thirdStorage.getTimerState();
        assert(readState.active === true, 'readState.active should be true');
        assert(readState.remainingSeconds === 1500, 'remainingSeconds should match');
        assert(readState.notified === false, 'notified should match');

        print('✓ Production Storage class tests PASSED with 100% real module execution.');
    } finally {
        GLib.spawn_command_line_sync(`rm -rf "${tmpDir}"`);
    }
}

runStorageTests();

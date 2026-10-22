/* modules/storage.js
 * Atomic JSON persistent storage in XDG user data directory (~/.local/share/cream-island)
 * Handles calendar notes and timer state across reloads and suspends.
 * Supports custom data directory for testing isolation.
 */

const { GLib, Gio } = imports.gi;

var Storage = class Storage {
    constructor(customDataDir = null) {
        this._dataDir = customDataDir || GLib.build_filenamev([GLib.get_user_data_dir(), 'cream-island']);
        this._ensureDir();
        this._notesFile = GLib.build_filenamev([this._dataDir, 'notes.json']);
        this._timerFile = GLib.build_filenamev([this._dataDir, 'timer_state.json']);
        this._notesCache = null;
    }

    _ensureDir() {
        try {
            if (!GLib.file_test(this._dataDir, GLib.FileTest.EXISTS)) {
                GLib.mkdir_with_parents(this._dataDir, 0o755);
            }
        } catch (e) {
            log('[CreamIsland] Failed to create data directory: ' + e);
        }
    }

    _atomicWrite(filePath, dataObj) {
        try {
            this._ensureDir();
            let jsonString = JSON.stringify(dataObj, null, 2);
            let success = GLib.file_set_contents(filePath, jsonString);
            return success;
        } catch (e) {
            log('[CreamIsland] Failed to write atomic file ' + filePath + ': ' + e);
            return false;
        }
    }

    _readJson(filePath, defaultValue) {
        try {
            if (!GLib.file_test(filePath, GLib.FileTest.EXISTS)) {
                return defaultValue;
            }
            let [ok, contents] = GLib.file_get_contents(filePath);
            if (!ok) return defaultValue;
            let str = (typeof contents === 'string') ? contents : imports.byteArray.toString(contents);
            return JSON.parse(str);
        } catch (e) {
            log('[CreamIsland] Failed to read JSON from ' + filePath + ': ' + e);
            return defaultValue;
        }
    }

    // --- Notes Management ---

    getAllNotes() {
        if (!this._notesCache) {
            this._notesCache = this._readJson(this._notesFile, {});
        }
        return this._notesCache;
    }

    getNoteForDate(dateKey) { // e.g. "2026-10-19"
        let notes = this.getAllNotes();
        return notes[dateKey] || '';
    }

    saveNoteForDate(dateKey, text) {
        let notes = this.getAllNotes();
        if (!text || text.trim() === '') {
            delete notes[dateKey];
        } else {
            notes[dateKey] = text.trim();
        }
        this._notesCache = notes;
        this._atomicWrite(this._notesFile, notes);
    }

    hasNoteForDate(dateKey) {
        let notes = this.getAllNotes();
        return !!(notes[dateKey] && notes[dateKey].trim().length > 0);
    }

    // --- Timer State Management ---

    saveTimerState(state) {
        return this._atomicWrite(this._timerFile, state);
    }

    getTimerState() {
        let def = {
            active: false,
            paused: false,
            targetTimestamp: 0,
            remainingSeconds: 0,
            totalSeconds: 0,
            notified: false
        };
        return this._readJson(this._timerFile, def);
    }

    clearTimerState() {
        this.saveTimerState({
            active: false,
            paused: false,
            targetTimestamp: 0,
            remainingSeconds: 0,
            totalSeconds: 0,
            notified: false
        });
    }
};

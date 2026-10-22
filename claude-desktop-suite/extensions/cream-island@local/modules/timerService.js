/* modules/timerService.js
 * Independent background Timer Service initialized on extension enable.
 * Manages timer state, sleep recovery, atomic persistence, and notification dispatch
 * regardless of whether the island panel is open or closed.
 */

const { GLib, GObject } = imports.gi;

let Main = null;
try {
    Main = imports.ui.main;
} catch (e) {
    // Running in standalone test environment without gnome-shell UI
}

var TimerService = GObject.registerClass({
    Signals: {
        'state-changed': { param_types: [GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_BOOLEAN, GObject.TYPE_BOOLEAN] },
        'completed': {}
    }
}, class TimerService extends GObject.Object {
    _init(storage) {
        super._init();
        this._storage = storage;
        this._tickerId = 0;
        this._state = this._storage.getTimerState();
        this._resumeOrValidateState();
    }

    getState() {
        return {
            active: Boolean(this._state.active),
            paused: Boolean(this._state.paused),
            targetTimestamp: Number(this._state.targetTimestamp) || 0,
            remainingSeconds: Math.max(0, Number(this._state.remainingSeconds) || 0),
            totalSeconds: Math.max(0, Number(this._state.totalSeconds) || 0),
            notified: Boolean(this._state.notified)
        };
    }

    _resumeOrValidateState() {
        if (!this._state || typeof this._state.remainingSeconds !== 'number') {
            this._state = {
                active: false,
                paused: false,
                targetTimestamp: 0,
                remainingSeconds: 300,
                totalSeconds: 300,
                notified: false
            };
            this._saveState();
        }

        if (this._state.active && !this._state.paused) {
            let now = Date.now();
            let rem = Math.round((this._state.targetTimestamp - now) / 1000);
            if (rem <= 0) {
                this._state.active = false;
                this._state.remainingSeconds = 0;
                if (!this._state.notified) {
                    this._state.notified = true;
                    // Persist state before or upon notification
                    this._saveState();
                    this._triggerCompletionNotification();
                } else {
                    this._saveState();
                }
            } else {
                this._state.remainingSeconds = rem;
                this._startTicking();
            }
        }
        this._emitStateChanged();
    }

    setPreset(seconds) {
        if (typeof seconds !== 'number' || seconds <= 0) return;
        this._stopTicking();
        this._state.totalSeconds = seconds;
        this._state.remainingSeconds = seconds;
        this._state.active = false;
        this._state.paused = false;
        this._state.notified = false;
        this._saveState();
        this._emitStateChanged();
    }

    setCustomMinutes(text) {
        if (!TimerService.validateMinutesString(text)) {
            return false;
        }
        let minutes = parseInt(text.trim(), 10);
        this.setPreset(minutes * 60);
        return true;
    }

    static validateMinutesString(str) {
        if (typeof str !== 'string') return false;
        let trimmed = str.trim();
        // Strict integer regex: only positive whole numbers with no letters or decimals
        if (!/^[1-9]\d*$/.test(trimmed)) {
            return false;
        }
        let val = parseInt(trimmed, 10);
        return val >= 1 && val <= 1440;
    }

    toggleStartPause() {
        if (!this._state.active) {
            // Start
            if (this._state.remainingSeconds <= 0) {
                this._state.remainingSeconds = this._state.totalSeconds > 0 ? this._state.totalSeconds : 300;
            }
            this._state.active = true;
            this._state.paused = false;
            this._state.notified = false;
            this._state.targetTimestamp = Date.now() + this._state.remainingSeconds * 1000;
            this._saveState();
            this._startTicking();
            this._emitStateChanged();
        } else if (!this._state.paused) {
            // Pause
            this._stopTicking();
            let now = Date.now();
            this._state.remainingSeconds = Math.max(0, Math.round((this._state.targetTimestamp - now) / 1000));
            this._state.paused = true;
            this._saveState();
            this._emitStateChanged();
        } else {
            // Resume
            this._state.paused = false;
            this._state.targetTimestamp = Date.now() + this._state.remainingSeconds * 1000;
            this._saveState();
            this._startTicking();
            this._emitStateChanged();
        }
    }

    reset() {
        this._stopTicking();
        this._state.active = false;
        this._state.paused = false;
        this._state.notified = false;
        this._state.remainingSeconds = this._state.totalSeconds > 0 ? this._state.totalSeconds : 300;
        this._saveState();
        this._emitStateChanged();
    }

    _startTicking() {
        if (this._tickerId) return;
        this._tickerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            let now = Date.now();
            let rem = Math.round((this._state.targetTimestamp - now) / 1000);
            if (rem <= 0) {
                this._state.remainingSeconds = 0;
                this._state.active = false;
                if (!this._state.notified) {
                    this._state.notified = true;
                    this._saveState();
                    this._triggerCompletionNotification();
                } else {
                    this._saveState();
                }
                this._stopTicking();
                this._emitStateChanged();
                return GLib.SOURCE_REMOVE;
            } else {
                this._state.remainingSeconds = rem;
                this._emitStateChanged();
                return GLib.SOURCE_CONTINUE;
            }
        });
    }

    _stopTicking() {
        if (this._tickerId) {
            GLib.source_remove(this._tickerId);
            this._tickerId = 0;
        }
    }

    _triggerCompletionNotification() {
        this.emit('completed');
        try {
            if (typeof Main !== 'undefined' && Main && Main.notify) {
                Main.notify('Cream Island 计时器', '您设定的倒计时已完成！');
            }
        } catch (e) {
            log('[CreamIsland] Failed to dispatch timer notification: ' + e);
        }
    }

    _emitStateChanged() {
        this.emit(
            'state-changed',
            Math.max(0, this._state.remainingSeconds),
            Math.max(0, this._state.totalSeconds),
            Boolean(this._state.active),
            Boolean(this._state.paused)
        );
    }

    _saveState() {
        try {
            this._storage.saveTimerState(this._state);
        } catch (e) {
            log('[CreamIsland] Warning: could not persist timer state: ' + e);
        }
    }

    destroy() {
        this._stopTicking();
    }
});

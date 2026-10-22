/* modules/timerView.js
 * Timer View subscriber interacting with the background TimerService.
 */

const { Clutter, GObject, St } = imports.gi;
const Layout = imports.misc.extensionUtils.getCurrentExtension().imports.modules.layout;
const Cairo = imports.cairo;

var TimerView = GObject.registerClass(class TimerView extends St.BoxLayout {
    _init(timerService) {
        super._init({
            vertical: true,
            style_class: 'cream-island-card cream-island-timer'
        });

        this._timerService = timerService;
        this._signals = [];
        this._active = false;

        this._buildUI();
        this._attachService();
    }

    _buildUI() {
        // Title
        let titleRow = new St.BoxLayout({ vertical: false });
        let title = new St.Label({
            text: '倒计时器',
            style_class: 'cream-island-title',
            x_expand: true
        });
        titleRow.add_child(title);
        this.add_child(titleRow);

        // A St/Cairo ring; no shader, texture sampling or background capture.
        let dial = new St.Widget({
            style_class: 'cream-island-timer-dial',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER
        });
        this._ring = new St.DrawingArea({ x_expand: true, y_expand: true });
        this._progress = 0;
        this._ring.connect('repaint', () => this._paintRing());
        dial.add_child(this._ring);
        this._displayLabel = new St.Label({
            text: '00:00', style_class: 'cream-island-timer-display',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER
        });
        dial.add_child(this._displayLabel);
        this.add_child(dial);
        this._statusLabel = new St.Label({
            text: '准备开始', style_class: 'cream-island-subtitle',
            x_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(this._statusLabel);

        let presetsBox = new St.BoxLayout({ vertical: true,
            style_class: 'cream-island-timer-presets', x_align: Clutter.ActorAlign.CENTER });
        this._presetButtons = [];
        let presets = [
            { label: '1 分钟', sec: 60 }, { label: '5 分钟', sec: 300 },
            { label: '15 分钟', sec: 900 }, { label: '25 分钟 · 专注', sec: 1500 },
            { label: '45 分钟', sec: 2700 }
        ];
        let row;
        presets.forEach((preset, index) => {
            if (index === 0 || index === 3) {
                row = new St.BoxLayout({ style_class: 'cream-island-timer-preset-row',
                    x_align: Clutter.ActorAlign.CENTER });
                presetsBox.add_child(row);
            }
            let button = new St.Button({ label: preset.label,
                style_class: 'cream-island-chip cream-island-timer-preset' });
            button.connect('clicked', () => this._timerService.setPreset(preset.sec));
            row.add_child(button);
            this._presetButtons.push({ button: button, seconds: preset.sec });
        });
        this.add_child(presetsBox);

        // Custom duration input row
        let inputRow = new St.BoxLayout({
            vertical: false,
            style_class: 'cream-island-timer-input-row',
            x_align: Clutter.ActorAlign.CENTER
        });
        let inputLbl = new St.Label({
            text: '分钟',
            style_class: 'cream-island-subtitle',
            y_align: Clutter.ActorAlign.CENTER
        });
        inputRow.add_child(inputLbl);

        this._minEntry = new St.Entry({
            text: '10',
            style_class: 'cream-island-entry cream-island-timer-minutes',
            can_focus: true
        });
        this._minEntry.clutter_text.set_max_length(4);
        inputRow.add_child(this._minEntry);

        let setBtn = new St.Button({
            label: '设定',
            style_class: 'cream-island-btn'
        });
        setBtn.connect('clicked', () => this._applyCustomMinutes());
        inputRow.add_child(setBtn);
        this.add_child(inputRow);

        // Controls (Start/Pause, Cancel)
        let ctrlRow = new St.BoxLayout({
            vertical: false,
            style_class: 'cream-island-timer-controls',
            x_align: Clutter.ActorAlign.CENTER
        });

        this._startBtn = new St.Button({
            label: '开始',
            style_class: 'cream-island-btn-accent cream-island-timer-primary'
        });
        this._startBtn.connect('clicked', () => this._timerService.toggleStartPause());
        ctrlRow.add_child(this._startBtn);

        this._cancelBtn = new St.Button({
            label: '重置',
            style_class: 'cream-island-btn cream-island-timer-reset'
        });
        this._cancelBtn.connect('clicked', () => this._timerService.reset());
        ctrlRow.add_child(this._cancelBtn);

        this.add_child(ctrlRow);
    }

    setActive(active) {
        this._active = active;
        if (active) {
            let state = this._timerService.getState();
            this._updateUI(state.remainingSeconds, state.totalSeconds, state.active, state.paused);
        }
    }

    _paintRing() {
        if (!this._active) return;
        let [width, height] = this._ring.get_surface_size();
        if (width <= 0 || height <= 0) return;
        let cr = this._ring.get_context();
        try {
            let line = Math.max(2, Math.min(width, height) * 0.022);
            let radius = Math.max(1, Math.min(width, height) / 2 - line * 2);
            cr.setLineWidth(line);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setSourceRGBA(1, 1, 1, 0.12);
            cr.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
            cr.stroke();
            if (this._progress > 0) {
                cr.setSourceRGBA(1, 1, 1, 0.92);
                cr.arc(width / 2, height / 2, radius, -Math.PI / 2,
                    -Math.PI / 2 + Math.PI * 2 * this._progress);
                cr.stroke();
            }
        } finally { cr.$dispose(); }
    }

    _attachService() {
        let sig1 = this._timerService.connect('state-changed', (src, rem, tot, act, paused) => {
            this._updateUI(rem, tot, act, paused);
        });
        let sig2 = this._timerService.connect('completed', () => {
            this._statusLabel.set_text('计时结束');
        });
        this._signals.push({ obj: this._timerService, id: sig1 });
        this._signals.push({ obj: this._timerService, id: sig2 });

        // Initial sync
        let s = this._timerService.getState();
        this._updateUI(s.remainingSeconds, s.totalSeconds, s.active, s.paused);
    }

    _formatTime(seconds) {
        let s = Math.max(0, Math.floor(seconds));
        let h = Math.floor(s / 3600);
        let m = Math.floor((s % 3600) / 60);
        let sec = s % 60;
        let mm = ('0' + m).slice(-2);
        let ss = ('0' + sec).slice(-2);
        if (h > 0) {
            let hh = ('0' + h).slice(-2);
            return `${hh}:${mm}:${ss}`;
        }
        return `${mm}:${ss}`;
    }

    _updateUI(remainingSeconds, totalSeconds, active, paused) {
        if (!this._active) return;
        this._progress = Layout.timerProgress(remainingSeconds, totalSeconds);
        this._ring.queue_repaint();
        this._presetButtons.forEach(item => {
            if (item.seconds === totalSeconds) item.button.add_style_class_name('active');
            else item.button.remove_style_class_name('active');
        });
        this._displayLabel.set_text(this._formatTime(remainingSeconds));
        if (active && !paused) {
            this._statusLabel.set_text('正在计时');
            this._startBtn.set_label('暂停');
        } else if (active && paused) {
            this._statusLabel.set_text('已暂停');
            this._startBtn.set_label('继续');
        } else {
            this._statusLabel.set_text(totalSeconds > 0 && remainingSeconds <= 0 ? '计时结束' : '准备开始');
            this._startBtn.set_label('开始');
        }
    }

    _applyCustomMinutes() {
        let rawText = this._minEntry.get_text();
        let ok = this._timerService.setCustomMinutes(rawText);
        if (!ok) {
            this._statusLabel.set_text('请输入 1 到 1440 之间的正整数分钟');
        }
    }

    destroy() {
        this._signals.forEach(s => {
            try {
                s.obj.disconnect(s.id);
            } catch (e) {}
        });
        this._signals = [];
        super.destroy();
    }
});

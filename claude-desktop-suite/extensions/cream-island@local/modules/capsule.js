/* GNOME 3.36 native fixed-size anchor. Final-size content is allocated once;
 * only an independent background transform animates. Text/ancestors never scale. */
const { Clutter, GLib, GObject, St } = imports.gi;
const PanelMenu = imports.ui.panelMenu;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Layout = Me.imports.modules.layout;
const Runtime = Me.imports.modules.runtime;
const Appearance = Me.imports.modules.appearance;
const DockController = Me.imports.modules.dockController.DockController;
var CapsuleButton = GObject.registerClass({ Signals: {
    'open-requested': { param_types: [GObject.TYPE_STRING] }, 'dismiss-requested': {}
} }, class CapsuleButton extends PanelMenu.Button {
    _init(config) {
        super._init(0.5, 'Cream Island', true);
        this._config = config; this._hovered = false; this._lastState = {mode:'idle',title:'',unread:0}; this._dead = false; this._themeRevision = 0;
        this.add_style_class_name('cream-island-indicator');
        this._host = new St.Widget({ layout_manager: new Clutter.FixedLayout(), clip_to_allocation: false });
        this._surface = new St.Widget({ layout_manager: new Clutter.FixedLayout(), reactive: true, track_hover: true,
            clip_to_allocation: false });
        this._background = new St.Widget({ style_class: 'cream-island-top-surface', reactive: true });
        this._background.set_pivot_point(0.5, 0.5);
        this._row = new St.BoxLayout({ style_class: 'cream-island-top-content', reactive: true,
            clip_to_allocation: true });
        this._dot = new St.Widget({ style_class: 'cream-island-top-dot', y_align: Clutter.ActorAlign.CENTER });
        this._icon = new St.Icon({ style_class: 'cream-island-top-icon', visible: false, y_align: Clutter.ActorAlign.CENTER });
        this._label = new St.Label({ style_class: 'cream-island-top-title', x_expand: true,
            y_align: Clutter.ActorAlign.CENTER, visible: false });
        this._label.min_width = 0;
        this._badge = new St.Icon({ icon_name: 'notifications-symbolic', style_class: 'cream-island-top-badge',
            y_align: Clutter.ActorAlign.CENTER, visible: false });
        this._hours = new St.Label({style_class:'cream-island-clock-part', y_align:Clutter.ActorAlign.CENTER});
        this._minutes = new St.Label({style_class:'cream-island-clock-part', y_align:Clutter.ActorAlign.CENTER});
        this._micClock = new St.Label({style_class:'cream-island-mic-clock', visible:false, y_align:Clutter.ActorAlign.CENTER});
        this._mic = new St.Icon({icon_name:'microphone-sensitivity-high-symbolic',style_class:'cream-island-top-icon',visible:false});
        this._levelBar=new St.Widget({style_class:'cream-island-level-bar',visible:false});
        this._timer = new St.Label({style_class:'cream-island-timer-readout', visible:false, y_align:Clutter.ActorAlign.CENTER});
        this._actions = new St.BoxLayout({style_class:'cream-island-hover-actions', visible:false});
        let actions = [['timer','alarm-symbolic','计时器'],['media','video-x-generic-symbolic','媒体'],
            ['notifications','notifications-symbolic','通知'],['workspaces','view-dual-symbolic','工作区'],
            ['wallpaper','preferences-desktop-wallpaper-symbolic','壁纸'],['power','system-shutdown-symbolic','电源'],
            ['control-center','preferences-system-symbolic','控制中心'],['launcher','view-grid-symbolic','应用']];
        this._actionButtons=[];
        actions.forEach(([id,icon,title]) => {
            let button = new St.Button({style_class:'cream-island-hover-action',can_focus:true,accessible_name:title});
            button.set_child(new St.Icon({icon_name:icon,style_class:'cream-island-top-icon'}));
            button.connect('clicked',()=>this.emit('open-requested',id)); this._actions.add_child(button); this._actionButtons.push(button);
        });
        [this._hours,this._dot,this._actions,this._icon,this._label,this._timer,this._mic,this._levelBar,this._badge,this._minutes,this._micClock]
            .forEach(child => this._row.add_child(child));
        this.updateClock();
        this._surface.connect('notify::hover',()=>this._setHover(this._surface.hover));
        this._surface.add_child(this._background); this._surface.add_child(this._row);
        this._host.add_child(this._surface);
        this.add_child(this._host); // ButtonBox's first child has fixed preferred size.
        this._motion = new Runtime.TransitionGuard(this._background);
        this._controller = new DockController({
            content: state => this._content(state), measure: (state, bounds) => this._measure(state, bounds),
            layout: plan => this._layout(plan), animate: plan => this._animate(plan), settle: () => this._settle()
        });
        // Plain click only reveals controls; selecting an icon opens a page.
        this.connect('button-press-event',(actor,event)=>{let source=event.get_source(); if(this._actions.contains(source))return Clutter.EVENT_PROPAGATE;this._setHover(true);return Clutter.EVENT_STOP;});
        this.connect('key-press-event',(actor,event)=>{
            let key=event.get_key_symbol();
            if(key!==Clutter.KEY_Escape && this._actions.contains(event.get_source()))return Clutter.EVENT_PROPAGATE;
            if (key===Clutter.KEY_Escape) {this.collapse();this.emit('dismiss-requested'); return Clutter.EVENT_STOP;}
            if ([Clutter.KEY_Return,Clutter.KEY_space,Clutter.KEY_Down].includes(key)) {
                this._keyboardPreview=true; this._setHover(true); this._actions.get_first_child().grab_key_focus(); return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.updateAppearance(); this.refreshBounds();
    }
    updateAppearance() {
        let style = Appearance.glassStyle(this._config.getInt('glass-opacity', 89), false);
        if (this._background.get_style() !== style) this._background.set_style(style);
    }
    invalidateTheme() { this._themeRevision++; }
    refreshBounds() {
        let side = box => box ? box.get_preferred_width(-1)[1] : 0;
        return this._controller.setBounds({
            scale: St.ThemeContext.get_for_stage(global.stage).scale_factor,
            height: Main.panel.height || 0, width: Main.panel.width || 0,
            left: side(Main.panel._leftBox), right: side(Main.panel._rightBox), themeRevision: this._themeRevision
        });
    }
    render(state) { this._lastState=state; this._controller.render(Object.assign({},state,{hover:this._hovered,timerVisible:Boolean(this._timerActive),micVisible:Boolean(this._micActive)})); }
    setPopup(panel){this._popup=panel;}
    _watchOutside(){
        if(this._outsideId)return;
        this._outsideId=global.stage.connect('captured-event',(stage,event)=>{
            if(event.type()!==Clutter.EventType.BUTTON_PRESS || (this._popup&&this._popup._isOpen))return Clutter.EVENT_PROPAGATE;
            let [x,y]=event.get_coords(),[sx,sy]=this._surface.get_transformed_position(),[w,h]=this._surface.get_transformed_size();
            if(x<sx||x>sx+w||y<sy||y>sy+h){this.collapse();this.emit('dismiss-requested');}
            return Clutter.EVENT_PROPAGATE;
        });
    }
    collapse(){
        if(this._leaveId){GLib.source_remove(this._leaveId);this._leaveId=0;}
        if(this._outsideId){global.stage.disconnect(this._outsideId);this._outsideId=0;}
        let focus=global.stage.get_key_focus();
        if(focus&&this._actions.contains(focus))this.grab_key_focus();
        this._hovered=false;this._keyboardPreview=false;this._suppressHover=this._surface.hover;this.render(this._lastState);
    }
    _setHover(value) {
        if(this._suppressHover){if(!value)this._suppressHover=false;else return;}
        if(this._leaveId){GLib.source_remove(this._leaveId);this._leaveId=0;}
        if(!value){
            this._leaveId=GLib.timeout_add(GLib.PRIORITY_DEFAULT,150,()=>{this._leaveId=0;
                let focus=global.stage.get_key_focus();
                if(this._surface.hover || this._keyboardPreview || this._lastState.mode==='open')return GLib.SOURCE_REMOVE;
                this.collapse();return GLib.SOURCE_REMOVE;});return;
        }
        if (this._hovered===value) return;
        this._hovered=value; this._watchOutside(); this.render(this._lastState);
    }
    updateClock() {
        let now=GLib.DateTime.new_now_local();
        this._hours.text=now.format('%H'); this._minutes.text=now.format('%M'); this._micClock.text=now.format('%H:%M');
    }
    updateTimer(state) {
        // Fixed monospace slot: ticks never enter the render/measure/animation path.
        let visible=state.active || state.paused, changed=Boolean(this._timerActive)!==visible;this._timerActive=visible;
        this._timer.visible=visible;
        let seconds=Math.max(0,Math.ceil(state.remainingSeconds));
        this._timer.text=seconds>=3600?String(Math.floor(seconds/3600)).padStart(2,'0')+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):
            String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
        if(changed)this.render(this._lastState);
    }
    updateMic(state){let changed=Boolean(this._micActive)!==state.active;this._micActive=state.active;this._mic.visible=state.active;this._levelBar.visible=state.active&&!state.muted&&state.levelAvailable;
        if(changed)this.render(this._lastState);}
    updateLevel(value){this._levelBar.scale_y=Math.max(0,value);}

    _content(state) {
        let expanded = !state.hover && (state.mode === 'notification' || state.mode === 'media');
        let idle=!state.hover&&state.mode==='idle'&&!state.timerVisible&&!state.micVisible;
        this._hours.visible=idle;this._minutes.visible=idle;
        this._micClock.visible=state.micVisible&&!state.hover&&!['open','locked'].includes(state.mode);
        this._row.x_align=Clutter.ActorAlign.CENTER;
        this._actions.visible=Boolean(state.hover); this._dot.visible = idle; this._icon.visible = expanded; this._label.visible = expanded;
        this._icon.icon_name = state.mode === 'media' ? 'media-playback-start-symbolic' : 'notifications-symbolic';
        if (this._label.text !== state.title) this._label.text = state.title;
        this._badge.visible = state.mode === 'media' && state.unread > 0;
        if (state.unread) this._row.add_style_pseudo_class('unread');
        else this._row.remove_style_pseudo_class('unread');
        this.accessible_name = expanded ? state.title : 'Cream Island，打开功能面板';
        if (state.unread) this.accessible_name += '，' + state.unread + '条未读通知';
    }
    _measure(state, bounds) {
        let s = bounds.scale, panelHeight = bounds.height || 24 * s;
        let height = Math.max(1, Math.min(24 * s, panelHeight - 4 * s));
        let slot = 64*s;
        let diameter = Math.max(1, Math.min(6 * s, height - 4 * s));
        this._dot.set_size(diameter, diameter);
        [this._hours,this._minutes].forEach(label=>label.min_width=18*s);
        this._timer.min_width=64*s;
        this._micClock.min_width=44*s; this._micClock.width=44*s;
        let expanded = !state.hover && (state.mode === 'notification' || state.mode === 'media');
        let idle=!state.hover&&state.mode==='idle'&&!state.timerVisible&&!state.micVisible;
        let raw=idle?50*s:0;
        if(state.hover)raw+=8*24*s;
        if(state.timerVisible)raw+=68*s;
        if(state.micVisible)raw+=28*s;
        if(state.micVisible&&!state.hover&&!['open','locked'].includes(state.mode))raw+=48*s;
        if(this._badge.visible)raw+=14*s;
        if(expanded)raw+=this._icon.get_preferred_width(-1)[1]+
            this._label.get_clutter_text().get_preferred_width(-1)[1]+8*s;
        let [,natural]=this._row.get_theme_node().adjust_preferred_width(raw,raw);
        let maximum=Layout.topBarBudget(bounds.width||1,s,bounds.left,bounds.right,state.hover?420:280);
        // Exactly one host allocation per changed target. The complete toolbar
        // is inside the native hit region; only the background animates.
        let target=Math.min(maximum,Math.max(slot,natural));
        return {slot:target,height:height,target:target,maximum:maximum,contentWidth:idle?Math.min(target,natural):target};
    }

    _layout(plan) {
        this._fromWidth = this._background.width * this._background.scale_x;
        this._host.set_size(plan.slot, plan.height);
        this._surface.set_size(plan.target, plan.height);
        this._surface.set_position(0, 0);
        this._row.set_size(plan.contentWidth, plan.height);
        this._row.set_position((plan.target-plan.contentWidth)/2,0);
        this._row.remove_all_transitions();
        this._row.opacity = 255;
        this._background.set_size(plan.target, plan.height);
    }
    _settle() { this._motion.begin(); this._background.scale_x = 1; this._row.opacity = 255; }
    _animate(plan) {
        let token = this._motion.begin();
        if (!St.Settings.get().enable_animations || !this.mapped) { this._background.scale_x = 1; return false; }
        this._background.scale_x = Math.max(0.01, Math.min(this._fromWidth, plan.maximum) / Math.max(1, plan.target));
        if (this._row.opacity < 255) this._row.ease({ opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        this._background.ease({ scale_x: Math.min(1.02, plan.maximum / Math.max(1, plan.target)), duration: 175,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC, onComplete: () => {
                if (!this._motion.current(token)) return;
                this._background.ease({ scale_x: 1, duration: 65, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            } });
        return true;
    }
    getDiagnostics() { return Object.assign({}, this._controller.stats); }
    destroy() { this._dead = true; if(this._outsideId)global.stage.disconnect(this._outsideId); if(this._leaveId)GLib.source_remove(this._leaveId); this._controller.destroy(); this._motion.destroy(); this._row.remove_all_transitions(); super.destroy(); }
});

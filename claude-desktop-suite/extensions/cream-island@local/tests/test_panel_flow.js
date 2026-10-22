// Actual Capsule signal wiring -> PageFlow -> Panel presentation and dismissal.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let signals=0,jobs=new Map(),focus=null,modal=0;
class Actor{
 constructor(props={}){Actor.prototype._init.call(this,props);}
 _init(props={}){this.children=[];this.handlers=new Map();this.visible=true;this.opacity=255;this.width=0;this.height=0;Object.assign(this,props);}
 connect(name,fn){let id=++signals;this.handlers.set(id,[name,fn]);return id;}
 disconnect(id){this.handlers.delete(id);}
 emit(name,...args){for(let [n,fn]of [...this.handlers.values()])if(n===name)fn(this,...args);}
 add_child(child){child.parent=this;this.children.push(child);}set_child(child){this.add_child(child);}add_actor(child){this.add_child(child);}
 remove_child(child){this.children=this.children.filter(x=>x!==child);child.parent=null;}remove_all_children(){this.children.forEach(x=>x.parent=null);this.children=[];}
 get_parent(){return this.parent;}get_first_child(){return this.children[0];}contains(child){return child===this||this.children.some(c=>c.contains(child));}
 add_style_class_name(){}remove_style_class_name(){}add_style_pseudo_class(){}remove_style_pseudo_class(){}
 set_pivot_point(){}get_style(){return '';}set_style(){}set_size(w,h){this.width=w;this.height=h;}set_position(x,y){this.x=x;this.y=y;}
 get_transformed_position(){return [this.x||0,this.y||0];}get_transformed_size(){return [this.width,this.height];}
 get_theme_node(){return {adjust_for_width:w=>w,adjust_preferred_width:(a,b)=>[a+24,b+24]};}
 get_preferred_width(){return [0,40];}get_clutter_text(){return this;}
 show(){this.visible=true;}hide(){this.visible=false;}grab_key_focus(){focus=this;}remove_transition(){}remove_all_transitions(){}
 ease(options){Object.assign(this,options);if(options.onComplete)options.onComplete();}destroy(){}
}
const stage=new Actor();stage.get_key_focus=()=>focus;
const GLib={DateTime:{new_now_local:()=>({format:()=> '12'})},get_monotonic_time:()=>1,PRIORITY_DEFAULT:0,PRIORITY_DEFAULT_IDLE:0,SOURCE_REMOVE:false,idle_add:(p,fn)=>{jobs.set(++signals,fn);return signals;},timeout_add:(p,t,fn)=>{jobs.set(++signals,fn);return signals;},source_remove:id=>jobs.delete(id)};
function flush(){let count=0;while(jobs.size){assert(++count<30);let callbacks=[...jobs.values()];jobs.clear();callbacks.forEach(fn=>fn());}}
let modules={},main={panel:Object.assign(new Actor(),{width:3840,height:54,_leftBox:new Actor(),_rightBox:new Actor()}),
 layoutManager:{primaryMonitor:{x:0,y:0,width:3840,height:2160}},screenShield:null,uiGroup:new Actor(),pushModal:()=>{modal++;return true;},popModal:()=>modal--};
let St={Widget:Actor,BoxLayout:Actor,Label:Actor,Icon:Actor,Button:Actor,ScrollView:Actor,PolicyType:{AUTOMATIC:0},
 ThemeContext:{get_for_stage:()=>({scale_factor:2})},Settings:{get:()=>({enable_animations:false})}};
let Clutter={ActorAlign:{CENTER:1},FixedLayout:class{},GridLayout:class{attach(){}},AnimationMode:{EASE_OUT_QUAD:1},EventType:{BUTTON_PRESS:1},EVENT_PROPAGATE:0,EVENT_STOP:1};
let context=vm.createContext({imports:{gi:{Clutter,GLib,St,GObject:{TYPE_STRING:1,registerClass:(m,c)=>c}},ui:{panelMenu:{Button:Actor},main},misc:{extensionUtils:{getCurrentExtension:()=>({imports:{modules}})}}},global:{stage}});
function load(file,names){let isolated=vm.createContext({...context,imports:context.imports,global:context.global});vm.runInContext(fs.readFileSync(file,'utf8'),isolated);return Object.fromEntries(names.map(n=>[n,isolated[n]]));}
modules.runtime=load('modules/runtime.js',['Coalescer','VisibleRelayout','TransitionGuard']);modules.layout=load('modules/layout.js',['topBarBudget','panelGeometry']);
modules.appearance={glassStyle:()=>''};modules.dockController=load('modules/dockController.js',['DockController']);modules.pageFlow=load('modules/pageFlow.js',['PageFlow']);
let built=0;class View extends Actor{constructor(){super();built++;}setActive(active){this.active=active;}}
modules.timerView={TimerView:View};modules.launcher={AppLauncherView:View};
let Capsule=load('modules/capsule.js',['CapsuleButton']).CapsuleButton;
let capsule=new Capsule();capsule._init({getInt:(k,v)=>v});capsule.render({mode:'idle',title:'',unread:0});
assert.equal(capsule._actionButtons.length,8);capsule._setHover(true);assert.equal(built,0,'hover creates no page');
assert(capsule._actionButtons.every(b=>b.visible));assert.equal(capsule._hours.visible,false);
let Panel=load('modules/panel.js',['IslandPanel']).IslandPanel;
let panel=new Panel();panel._init({},null,null,capsule,null,null);panel.height=96;capsule.setPopup(panel);
capsule.connect('open-requested',(actor,id)=>panel.toggle(id));capsule.connect('dismiss-requested',()=>panel.close());
capsule._actionButtons[0].emit('clicked');assert.equal(panel.height,960,'header preferred height does not lock viewport');flush();
assert.equal(built,1);assert(panel._currentView.visible&&panel._currentView.active);assert.equal(panel._currentView.get_parent(),panel._contentBox);assert.equal(panel._clockLabel.text,'计时器');assert.equal(modal,1);
let outside={type:()=>1,get_coords:()=>[-20,-20]};stage.emit('captured-event',outside);assert.equal(panel._isOpen,false);assert.equal(capsule._hovered,false);assert.equal(modal,0);flush();
capsule._setHover(true);capsule._actionButtons[0].emit('clicked');flush();assert.equal(built,1,'cached reopen keeps body');assert(panel._currentView.visible&&panel._currentView.active);assert.equal(panel.height,960);
panel.close(true);flush();capsule.render({mode:'idle',title:'',unread:0});assert(capsule._hours.visible&&capsule._minutes.visible);
let plan=capsule._measure({mode:'idle',hover:false,timerVisible:false,micVisible:false},{scale:2,height:54,width:3840,left:80,right:80});capsule._layout(plan);assert.equal(capsule._row.x,(plan.target-plan.contentWidth)/2,'clock content centered');
console.log('v8 production wiring: all actions, hover no build, first/cached body viewport, modal, outside collapse, symmetrical idle clock.');

// v9 uses the same shared-clock update; no tick enters the render controller.
capsule.updateMic({active:true,muted:false,levelAvailable:true});
assert(capsule._micClock.visible&&!capsule._hours.visible&&!capsule._minutes.visible);
let micPlan=capsule._measure({mode:'idle',hover:false,micVisible:true,timerVisible:false},{scale:2,height:54,width:3840,left:80,right:80});
assert.equal(capsule._micClock.width,88);assert.equal(capsule._micClock.min_width,88);
assert(micPlan.target>= (28+48+12)*2,'fixed mic and full HH:MM budget');
let stats=JSON.stringify(capsule.getDiagnostics());for(let i=0;i<100;i++)capsule.updateClock();assert.equal(JSON.stringify(capsule.getDiagnostics()),stats,'shared clock does not render or measure');
capsule._setHover(true);assert(!capsule._micClock.visible);capsule.collapse();
capsule.render({mode:'open',title:'',unread:0});assert(!capsule._micClock.visible);
capsule.render({mode:'media',title:'test',unread:0});assert(capsule._micClock.visible);
capsule.updateTimer({active:true,remainingSeconds:65});assert(capsule._micClock.visible&&capsule._timer.visible&&capsule._label.visible);
capsule.updateTimer({active:false,paused:false,remainingSeconds:0});capsule.updateMic({active:false,muted:false});
assert(!capsule._micClock.visible);capsule.render({mode:'idle',title:'',unread:0});assert(capsule._hours.visible&&capsule._minutes.visible);
console.log('v9 mic clock: fixed right HH:MM, shared updates without layout, hover/open hidden, media/timer preserved, stop restores idle.');

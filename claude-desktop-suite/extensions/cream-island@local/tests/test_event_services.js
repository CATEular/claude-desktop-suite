/* Actual production services with fake transport/signals; no session bus/UI. */
const { GLib } = imports.gi;
imports.searchPath.unshift('.');
const MediaService = imports.modules.mediaService.MediaService;
const NotificationService = imports.modules.notificationService.NotificationService;
function check(value, message) { if (!value) throw new Error(message); }
function scheduler() {
    let sequence = 0, now = 0, idle = new Map(), timers = new Map();
    return { idle, timers,
        schedule(callback) { let id=++sequence; idle.set(id,callback); return id; },
        after(ms,callback) { let id=++sequence; timers.set(id,{at:now+ms,callback}); return id; },
        cancel(id) { idle.delete(id); timers.delete(id); },
        flush() { while(idle.size) { let batch=Array.from(idle.values()); idle.clear(); batch.forEach(callback=>callback()); } },
        advance(ms) {
            let end=now+ms;
            while(true) {
                let due=Array.from(timers.entries()).filter(([id,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
                if(!due)break; now=due[1].at; timers.delete(due[0]); due[1].callback(); this.flush();
            }
            now=end;
        }
    };
}
// Bind injected functions just as production GLib closures are bound.
function boundClock() {
    let clock=scheduler();
    return { clock, schedule:callback=>clock.schedule(callback), cancel:id=>clock.cancel(id), after:(ms,cb)=>clock.after(ms,cb) };
}
async function settle(s) {
    for(let i=0;i<20;i++) await Promise.resolve();
    s.clock.flush();
    for(let i=0;i<20;i++) await Promise.resolve();
    s.clock.flush();
}
class Backend {
    constructor() {
        this.executable='/opt/apps/io.github.msojocs.bilibili/files/bin/bilibili';
        this.names=['org.mpris.MediaPlayer2.bilibili','org.mpris.MediaPlayer2.chromium'];
        this.owners={ [this.names[0]]:':1.10',[this.names[1]]:':1.20' };
        this.count={list:0,pid:0,cmd:0,properties:0,position:0,subscribe:0};
        this.propertyTargets=[]; this.propsCallbacks=new Map();
        this.props={CanPlay:true,PlaybackStatus:'Playing',Metadata:{'xesam:title':'song','mpris:length':120000000},Position:0};
    }
    async listNames(){this.count.list++;return this.names;}
    async owner(name){return this.owners[name];}
    async pid(owner){this.count.pid++;return owner===':1.10'?10:20;}
    async cmdline(pid){this.count.cmd++;return pid===10?this.executable+'\0--app':'/usr/bin/chromium\0bilibili';}
    async properties(owner){this.count.properties++;this.propertyTargets.push(owner);return this.props;}
    async position(){this.count.position++;return 10000000;}
    async command(){}
    watchOwners(callback){this.ownerCallback=callback;return()=>{this.ownerCallback=null;};}
    watchProperties(owner,callback){this.count.subscribe++;this.propsCallbacks.set(owner,callback);return()=>this.propsCallbacks.delete(owner);}
    changed(changed,invalidated){this.propsCallbacks.forEach(callback=>callback('org.mpris.MediaPlayer2.Player',changed,invalidated||[]));}
    destroy(){this.destroyed=true;}
}
class Signals {
    constructor(){this.signals=new Map();this.next=0;}
    connect(name,callback){let id=++this.next;this.signals.set(id,{name,callback});return id;}
    disconnect(id){this.signals.delete(id);}
    emit(name,...args){Array.from(this.signals.values()).filter(s=>s.name===name).forEach(s=>s.callback(this,...args));}
}
async function main(){
    let backend=new Backend(), s=boundClock(), service=new MediaService(backend,s), tickers=[], snapshots=[];
    service.subscribeTicker((title,playing)=>tickers.push({title,playing}));
    service.subscribe(value=>snapshots.push(value));
    await service.start(); await settle(s);
    check(backend.count.list===1&&backend.count.pid===2&&backend.count.cmd===2,'startup discovers once and asynchronously verifies owners');
    check(backend.propertyTargets.length===1&&backend.propertyTargets[0]===':1.10','no browser metadata is fetched');
    let ticks=tickers.length, published=snapshots.length;
    for(let i=0;i<1000;i++)backend.changed({PlaybackStatus:'Playing',Metadata:backend.props.Metadata});
    check(s.clock.idle.size===1,'property burst merges into one publication idle');
    await settle(s);
    check(tickers.length===ticks&&snapshots.length===published,'unchanged properties do not update top bar or page');
    backend.changed({Position:1200000}); await settle(s);
    check(tickers.length===ticks&&snapshots.length===published+1,'Position only updates page, not ticker');
    backend.ownerCallback('org.mpris.MediaPlayer2.bilibili.alias','',':1.10'); await settle(s);
    check(backend.count.pid===2&&backend.count.cmd===2,'same unique owner identity cached across names');
    service.setPositionVisible(true);check(s.clock.timers.size===1,'visible playing page has one low-frequency Position timer');
    s.clock.advance(10000);await settle(s);check(backend.count.position===1,'visible page reads Position at ten seconds');
    service.setPositionVisible(false);check(s.clock.timers.size===0,'closing page stops Position timer');
    s.clock.advance(30000);await settle(s);check(backend.count.position===1&&tickers.length===ticks,'hidden page performs no Position queries');
    let properties=backend.count.properties;
    for(let i=0;i<100;i++)backend.changed({},['Metadata']);
    await settle(s);
    check(backend.count.properties===properties+1,'invalidated property burst coalesces one refresh');
    check(backend.count.list===1,'no recurring ListNames discovery');
    service.destroy();
    check(backend.propsCallbacks.size===0&&!backend.ownerCallback&&s.clock.idle.size===0&&s.clock.timers.size===0,'destroy unsubscribes and removes scheduled work');
    let late=new Backend(), lateClock=boundClock(), resolvePid;
    late.names=[late.names[0]];
    late.pid=()=>{late.count.pid++;return new Promise(resolve=>{resolvePid=resolve;});};
    let slow=new MediaService(late,lateClock), latePublishes=0;
    slow.subscribe(()=>latePublishes++);
    let startup=slow.start();await settle(lateClock);
    check(typeof resolvePid==='function','async owner verification in flight');
    slow.destroy();resolvePid(10);await startup;await settle(lateClock);
    check(late.count.properties===0&&late.count.subscribe===0&&late.count.cmd===0&&latePublishes===0,'late PID result after destroy cannot read/bind/publish');

    // The real ticker -> state -> dock chain must ignore Position and reject
    // paused/closed/capability-less metadata instead of leaving a stale title.
    let closeBackend=new Backend(), closeClock=boundClock(), closeService=new MediaService(closeBackend,closeClock);
    const Dock=imports.modules.dockController.DockController, State=imports.modules.islandState.IslandState;
    let dock=new Dock({content(){},measure(state){return {target:state.mode==='media'?120:24};},layout(){},animate(){return true;},settle(){}});
    dock.setBounds({maximum:280});
    let state=new State({after:(ms,cb)=>closeClock.after(ms,cb),cancel:id=>closeClock.cancel(id)},value=>dock.render(value));
    closeService.subscribeTicker((title,playing)=>state.media(title,playing));
    await closeService.start();await settle(closeClock);
    check(state.snapshot().mode==='media','valid Playing + title + CanPlay activates top bar');
    let dockBefore=Object.assign({},dock.stats);
    for(let i=0;i<1000;i++)closeBackend.changed({Position:i});
    await settle(closeClock);
    check(dock.stats.renderEntries===dockBefore.renderEntries&&dock.stats.layouts===dockBefore.layouts,
        '1000 Position events never enter production dock render or layout');
    closeBackend.changed({PlaybackStatus:'Paused'});await settle(closeClock);
    check(state.snapshot().mode==='idle'&&closeService.getSnapshot().title==='song','pause keeps media-page title but retracts top bar');
    closeBackend.changed({PlaybackStatus:'Playing',CanPlay:false});await settle(closeClock);
    check(state.snapshot().mode==='idle'&&!closeService.getDiagnostics().topBarEligible,'CanPlay false retracts even if status says Playing');
    closeBackend.changed({CanPlay:true,Metadata:{}});await settle(closeClock);
    check(state.snapshot().mode==='idle'&&!closeService.getDiagnostics().metadataValid,'empty metadata clears title');
    closeBackend.changed({Metadata:{'xesam:title':'secret test title','mpris:trackid':'/org/mpris/MediaPlayer2/TrackList/NoTrack'}});await settle(closeClock);
    check(!closeService.getDiagnostics().metadataValid&&closeService.getDiagnostics().noTrack,'NoTrack is not active media');
    check(!JSON.stringify(closeService.getDiagnostics()).includes('secret test title'),'diagnostics contain no media title');
    closeBackend.changed({Metadata:{'xesam:title':'fresh'},PlaybackStatus:'Playing'});await settle(closeClock);
    check(state.snapshot().mode==='media','fresh valid track reactivates');
    closeBackend.changed({PlaybackStatus:'Stopped'});await settle(closeClock);
    check(state.snapshot().mode==='idle'&&!closeService.getSnapshot().title,'Stopped retracts title');
    closeBackend.changed({PlaybackStatus:'Playing'});await settle(closeClock);
    closeBackend.ownerCallback(closeBackend.names[0],':1.10','');
    check(!closeService.getSnapshot().connected&&!closeService.getSnapshot().title&&closeBackend.propsCallbacks.size===0,
        'owner loss clears properties, title and subscription immediately');
    await settle(closeClock);closeService.destroy();state.destroy();dock.destroy();

    let staleBackend=new Backend(), staleClock=boundClock(), resolveProperties;
    staleBackend.names=[staleBackend.names[0]];
    staleBackend.properties=()=>new Promise(resolve=>{resolveProperties=resolve;});
    let staleService=new MediaService(staleBackend,staleClock);
    await staleService.start();await settle(staleClock);
    staleBackend.changed({CanPlay:true,PlaybackStatus:'Playing',Metadata:{'xesam:title':'old'}});await settle(staleClock);
    check(staleService.getSnapshot().playing,'signal can initialize before GetAll reply');
    staleBackend.changed({},['Metadata']);await settle(staleClock);
    check(!staleService.getSnapshot().metadataValid&&!staleService.getSnapshot().title,'invalidated Metadata is deleted before refresh resolves');
    resolveProperties({CanPlay:true,PlaybackStatus:'Playing',Metadata:{'xesam:title':'old'}});await settle(staleClock);
    check(!staleService.getSnapshot().metadataValid&&!staleService.getSnapshot().title,'late pre-invalidation GetAll cannot resurrect the closed track');
    check(staleService.getDiagnostics().counters.propertiesFetches===2,'in-flight invalidation preserves exactly one follow-up refresh');
    resolveProperties({CanPlay:true,PlaybackStatus:'Playing',Metadata:{'xesam:title':'new valid track'}});await settle(staleClock);
    check(staleService.getSnapshot().title==='new valid track'&&staleService.getSnapshot().playing,
        'post-invalidation refresh can recover a newly valid track without another signal');
    check(staleService.getDiagnostics().counters.propertiesFetches===2,'follow-up refresh does not become polling');
    staleService.destroy();

    let tray=new Signals(), settings=new Signals(), source=new Signals(), old=new Signals(), nClock=boundClock();
    source.title='App';source.notifications=[old];old.title='old';tray.getSources=()=>[source];
    settings.enabled=true;settings.get_boolean=()=>settings.enabled;
    settings.set_boolean=(key,value)=>{settings.enabled=value;settings.emit('changed::show-banners');};
    let notifications=new NotificationService({tray,settings,scheduler:nClock}), incoming=[], changes=0;
    notifications.subscribeIncoming(event=>incoming.push(event));notifications.subscribe(()=>changes++);
    nClock.clock.flush();
    check(incoming.length===0&&notifications.history().length===1,'startup history creates no popup');
    let sourceConnections=source.signals.size, notification=new Signals();notification.title='<b>new message</b>';
    source.notifications.push(notification);
    source.emit('notification-added',notification);source.emit('notification-show',notification);
    check(incoming.length===2&&!incoming[0].show&&incoming[1].show&&incoming[0].id===incoming[1].id,'added and show share ID: count once, show once');
    check(!incoming[1].summary.includes('<b>'),'banner summary strips markup');
    for(let i=0;i<1000;i++)notification.emit('updated');
    check(nClock.clock.idle.size===1&&source.signals.size===sourceConnections&&notification.signals.size===2,'history burst schedules one refresh without reconnecting sources');
    let before=changes;nClock.clock.flush();check(changes===before+1,'history listeners called once per burst');
    notifications.setDnd(true);source.emit('notification-show',notification);
    check(!incoming[incoming.length-1].show,'DND blocks banners even if source requests show');
    notifications.destroy();nClock.clock.flush();
    check(tray.signals.size===0&&source.signals.size===0&&notification.signals.size===0&&old.signals.size===0&&settings.signals.size===0,'notification service disconnects every tracked signal');
    print('Production event services passed: single discovery, cached async identity, no browser metadata, property dedup/coalescing, visible Position, late destroy, stable notification wiring.');
}
let loop=new GLib.MainLoop(null,false), failure=null;
main().then(()=>loop.quit()).catch(error=>{failure=error;loop.quit();});
loop.run();
if(failure)throw failure;

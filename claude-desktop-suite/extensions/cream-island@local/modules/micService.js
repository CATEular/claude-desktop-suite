/* Session detection uses Shell's shared mixer. Meter reads default input only,
 * never a per-app capture. No audio is saved; helper returns scalar peaks. */
const {Gio, GLib} = imports.gi;
const Gvc=imports.gi.Gvc;
const Volume=imports.ui.status.volume;
const Me=imports.misc.extensionUtils.getCurrentExtension();
const Runtime=Me.imports.modules.runtime;
const Sessions=Me.imports.modules.pulseSessions;
var PulseTransport=class PulseTransport {
    _spawn(args){let launcher=new Gio.SubprocessLauncher({flags:Gio.SubprocessFlags.STDOUT_PIPE|Gio.SubprocessFlags.STDERR_SILENCE});
        launcher.setenv('LC_ALL','C',true);return launcher.spawnv(['pactl'].concat(args));}
    list(callback){let process,timer=0,done=false;
        const finish=value=>{if(done)return;done=true;if(timer)GLib.source_remove(timer);callback(value);};
        try{process=this._spawn(['list','source-outputs']);
            timer=GLib.timeout_add(GLib.PRIORITY_DEFAULT,5000,()=>{if(process)process.force_exit();finish(null);return GLib.SOURCE_REMOVE;});
            process.communicate_utf8_async(null,null,(p,result)=>{
                try{let [ok,text]=p.communicate_utf8_finish(result);finish(ok&&p.get_successful()?text:null);}catch(e){finish(null);}
            });}catch(e){finish(null);}
        return ()=>{done=true;if(timer)GLib.source_remove(timer);if(process)process.force_exit();};
    }
    subscribe(callback){let process,cancel=new Gio.Cancellable();
        try{process=this._spawn(['subscribe']);let input=new Gio.DataInputStream({base_stream:process.get_stdout_pipe()});
            const read=()=>input.read_line_async(GLib.PRIORITY_DEFAULT,cancel,(stream,result)=>{
                try{let [line]=stream.read_line_finish_utf8(result);if(line===null){callback(false);return;}
                    if(/on (source-output|source|server) #/.test(line))callback(true);read();}catch(e){if(!cancel.is_cancelled())callback(false);}
            });read();
        }catch(e){callback(false);}
        return ()=>{cancel.cancel();if(process)process.force_exit();};
    }
};
var MicService=class MicService {
    constructor(onState,onLevel,options={}) {
        this._state=onState;this._level=onLevel;this._control=options.control||Volume.getMixerControl();
        this._transport=options.transport||new PulseTransport();
        this._signals=[];this._streams=[];this._dead=false;this._locked=false;this._epoch=0;this._process=null;this._available=false;
        this._subscriptionHealthy=true;this._queryEpoch=0;this._querying=false;this._queryAgain=false;
        this._probe=new Runtime.Coalescer(
            cb=>GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,()=>{cb();return GLib.SOURCE_REMOVE;}),id=>GLib.source_remove(id),()=>this._query());
        ['stream-added','stream-removed','state-changed','default-source-changed'].forEach(signal=>
            this._signals.push(this._control.connect(signal,()=>{if(signal==='default-source-changed')this._stop();this._refresh();})));
        this._unsubscribe=this._transport.subscribe(ok=>{if(this._dead)return;if(ok){if(this._subscriptionHealthy)this._request();}else{this._subscriptionHealthy=false;this._queryEpoch++;this._apply([]);}});
        this._refresh();
    }
    setLocked(value){this._locked=value;if(value)this._apply([]);this._request();}
    _refresh(){
        if(this._dead)return;
        this._streams.forEach(([obj,id])=>obj.disconnect(id));this._streams=[];
        this._control.get_source_outputs().forEach(stream=>['notify::state','notify::is-muted'].forEach(signal=>
            this._streams.push([stream,stream.connect(signal,()=>this._request())])));
        let source=this._control.get_default_source();
        if(source)this._streams.push([source,source.connect('notify::is-muted',()=>this._request())]);
        this._request();
    }
    _request(){this._queryEpoch++;this._probe.request();}
    _query(){
        if(this._dead)return;
        if(this._querying){this._queryAgain=true;return;}
        let source=this._control.get_default_source();
        if(!this._subscriptionHealthy||this._locked||!source||source.is_muted||this._control.get_state()!==Gvc.MixerControlState.READY){this._apply([]);return;}
        this._querying=true;let epoch=this._queryEpoch,index=source.get_index();
        this._cancelQuery=this._transport.list(text=>{
            if(this._dead)return;this._querying=false;this._cancelQuery=null;
            if(epoch===this._queryEpoch)this._apply(text===null?[]:Sessions.parse(text,index));
            if(this._queryAgain||epoch!==this._queryEpoch){this._queryAgain=false;this._probe.request();}
        });
    }
    _publish(){if(this._dead)return;let state=Object.assign({},this._current,{levelAvailable:this._available});
        let key=JSON.stringify(state);if(key!==this._last){this._last=key;this._state(state);}}
    _apply(running){
        if(this._dead)return;
        let source=this._control.get_default_source(),muted=Boolean(source&&source.is_muted);
        let active=this._subscriptionHealthy&&!this._locked&&!muted&&running.length>0;
        let sessionKey=(active?running.join(','):'')+':'+(source?source.get_index():'');
        if(sessionKey!==this._sessionKey){this._sessionKey=sessionKey;this._failed=false;}
        this._current={active:active,muted:muted,defaultInput:true};
        if(active)this._start();else this._stop();this._publish();
    }
    _start(){
        if(this._process||this._failed)return;
        let epoch=++this._epoch;
        try{
            this._process=Gio.Subprocess.new(['python3',Me.path+'/scripts/microphone_level.py'],Gio.SubprocessFlags.STDOUT_PIPE|Gio.SubprocessFlags.STDERR_SILENCE);
            this._cancel=new Gio.Cancellable();
            let input=new Gio.DataInputStream({base_stream:this._process.get_stdout_pipe()});
            const read=()=>input.read_line_async(GLib.PRIORITY_DEFAULT,this._cancel,(stream,result)=>{
                if(this._dead||epoch!==this._epoch)return;
                try{let [line]=stream.read_line_finish_utf8(result);if(line===null){this._failed=true;this._stop();return;}
                    let value=Number(line);if(Number.isFinite(value)){if(!this._available){this._available=true;this._publish();}this._level(Math.max(0,Math.min(1,value)));}read();
                }catch(e){this._failed=true;this._stop();}
            });read();
        }catch(e){this._failed=true;this._stop();}
    }
    _stop(){++this._epoch;this._available=false;if(this._current)this._publish();if(this._cancel){this._cancel.cancel();this._cancel=null;}
        if(this._process){this._process.force_exit();this._process=null;}this._level(0);}
    destroy(){this._dead=true;this._probe.destroy();if(this._unsubscribe)this._unsubscribe();if(this._cancelQuery)this._cancelQuery();this._stop();this._signals.forEach(id=>this._control.disconnect(id));
        this._streams.forEach(([obj,id])=>obj.disconnect(id));this._signals=[];this._streams=[];}
};

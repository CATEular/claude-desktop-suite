const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Signal {constructor(){this.handlers=new Map();this.n=1;}connect(signal,cb){let id=this.n++;this.handlers.set(id,[signal,cb]);return id;}disconnect(id){this.handlers.delete(id);}emit(signal){for(let [name,cb]of Array.from(this.handlers.values()))if(name===signal)cb();}}
let output=new Signal(),source=Object.assign(new Signal(),{get_index:()=>3,is_muted:false});
let control=Object.assign(new Signal(),{get_source_outputs:()=>[output],get_default_source:()=>source,get_state:()=>1});
let jobs=new Map(),job=0;function flush(){while(jobs.size){let batch=[...jobs.values()];jobs.clear();batch.forEach(fn=>fn());}}
let starts=0,kills=0,read,states=[],subscribed,query,queries=0;
class Input{read_line_async(p,c,cb){read=()=>cb(this,{});}read_line_finish_utf8(){return [null];}}
let modules={};const context=vm.createContext({imports:{gi:{Gvc:{MixerControlState:{READY:1}},GLib:{PRIORITY_DEFAULT:0,PRIORITY_DEFAULT_IDLE:0,SOURCE_REMOVE:false,idle_add:(p,fn)=>{jobs.set(++job,fn);return job;},source_remove:id=>jobs.delete(id)},Gio:{
 Subprocess:{new:()=>{starts++;return {get_stdout_pipe:()=>({}),force_exit:()=>kills++};}},SubprocessFlags:{STDOUT_PIPE:1,STDERR_SILENCE:2},
 Cancellable:class{cancel(){}},DataInputStream:Input}},ui:{status:{volume:{getMixerControl:()=>control}}},misc:{extensionUtils:{getCurrentExtension:()=>({path:'/test',imports:{modules}})}}}});
vm.runInContext(fs.readFileSync('modules/runtime.js','utf8'),context);modules.runtime={Coalescer:context.Coalescer};
vm.runInContext(fs.readFileSync('modules/pulseSessions.js','utf8'),context);modules.pulseSessions={parse:context.parse};
vm.runInContext(fs.readFileSync('modules/micService.js','utf8'),context);
const block=(id,corked='no',muted='no',app='recorder',source=3)=>`Source Output #${id}\n\tSource: ${source}\n\tCorked: ${corked}\n\tMute: ${muted}\n\tProperties:\n\t\tapplication.id = "${app}"\n`;
const transport={list(cb){queries++;query=cb;return ()=>{};},subscribe(cb){subscribed=cb;return ()=>{};}};
let service=new context.MicService(x=>states.push(x),()=>{}, {control,transport});flush();
query(block(1,'yes'));assert.equal(starts,0,'corked object is not recording');assert.equal(states.at(-1).active,false);
subscribed(true);flush();query(block(1)+block(2,'no','no','cream-island-level@local'));assert.equal(starts,1);
subscribed(true);flush();query(block(1,'yes'));assert.equal(kills,1,'cork stops meter');assert.equal(states.at(-1).active,false);
subscribed(true);flush();query(block(1));assert.equal(starts,2,'uncorked external session restarts');
read();assert.equal(states.at(-1).levelAvailable,false);assert.equal(kills,2);
for(let i=0;i<100;i++){subscribed(true);flush();query(block(1)+block(2,'no','no','cream-island-level@local'));}
assert.equal(starts,2,'own stream churn does not restart failed meter');
subscribed(true);flush();query(block(1,'yes'));subscribed(true);flush();query(block(1));assert.equal(starts,3);
// Single in-flight query, one follow-up for bursts.
subscribed(true);flush();let pending=query,before=queries;for(let i=0;i<100;i++)subscribed(true);flush();assert.equal(queries,before);
pending(block(1));flush();assert.equal(queries,before+1);query(block(1));
service.setLocked(true);assert.equal(states.at(-1).active,false);assert.equal(kills,3);
service.setLocked(false);flush();let stale=query;subscribed(false);stale(block(1));flush();assert.equal(starts,3,'subscription failure rejects late running result');
let late=read;service.destroy();late();assert.equal(starts,3);assert.equal(control.handlers.size,0);assert.equal(output.handlers.size,0);
assert.equal(context.parse(block(1,'no','yes')+block(2,'no','no','recorder',7),3).length,0,'muted and other inputs excluded');
assert.equal(context.parse('garbage',3).length,0,'unknown protocol fails closed');
console.log('Production mic service: actual Corked/Mute protocol, default-source filtering, query coalescing, own-stream failure suppression, lock/destroy cleanup.');

let timeout,finished=0,killed=0,reply;
context.imports.gi.GLib.timeout_add=(p,ms,cb)=>{assert.equal(ms,5000);timeout=cb;return 991;};
let bounded=new context.PulseTransport();bounded._spawn=()=>({force_exit(){killed++;},communicate_utf8_async(a,b,cb){reply=()=>cb({communicate_utf8_finish:()=>[true,block(1)],get_successful:()=>true},{});}});
bounded.list(value=>{finished++;assert.equal(value,null);});timeout();reply();assert.equal(killed,1);assert.equal(finished,1,'timeout fails closed exactly once');
const actualFixture=fs.readFileSync('tests/fixtures/pactl-voice-input.txt','utf8');
assert.deepStrictEqual(Array.from(context.parse(actualFixture,3)),[4],'external parecord input remains active; helper excluded');
assert.equal(context.parse(actualFixture.slice(actualFixture.indexOf('Source Output #18')),3).length,0,'helper alone is not activity');

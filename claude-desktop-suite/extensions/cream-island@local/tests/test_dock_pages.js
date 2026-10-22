imports.searchPath.unshift('.');
const R=imports.modules.runtime, Dock=imports.modules.dockController.DockController,
    PageFlow=imports.modules.pageFlow.PageFlow;
function check(value,message){if(!value)throw new Error(message);}
function scheduler(){let id=0,jobs=new Map();return {jobs,schedule(cb){let key=++id;jobs.set(key,cb);return key;},
    cancel(key){jobs.delete(key);},flush(){while(jobs.size){let batch=Array.from(jobs.values());jobs.clear();batch.forEach(cb=>cb());}}};}
let calls={content:0,layout:0,animation:0}, view={
    content(){calls.content++;}, measure(state,b){return {target:state.title?Math.min(state.title.length*10,b.maximum):24,slot:24,height:24,maximum:b.maximum};},
    layout(){calls.layout++;},animate(){calls.animation++;return true;},settle(){}
}, dock=new Dock(view);
dock.setBounds({maximum:280});dock.render({mode:'idle',title:''});dock.render({mode:'media',title:'track'});
let before=JSON.stringify(dock.stats);
for(let i=0;i<1000;i++){dock.render({mode:'media',title:'track'});dock.setBounds({maximum:280});}
check(calls.layout===2&&calls.animation===1,'same render and unchanged external bounds cannot restart layout/animation');
check(dock.stats.measurements===2&&dock.stats.boundsChanges===1,'1000 no-op inputs do not measure again');
dock.render({mode:'media',title:'other'});
check(calls.content===3&&calls.layout===2&&calls.animation===1,'new text with same target updates content without restarting animation');
dock.setBounds({maximum:240});
check(calls.animation===1,'real bounds change with same target does not animate');
dock.destroy();dock.render({mode:'idle',title:''});check(calls.content===3,'destroyed render entry is inert');

let clock=scheduler(), s={schedule:cb=>clock.schedule(cb),cancel:id=>clock.cancel(id)}, events=[], cache=new Map(), flow;
let adapter={cached:id=>cache.get(id),
    build(id){events.push('build:'+id);let page={id};cache.set(id,page);return page;},
    present(page){events.push('present:'+page.id);},
    activate(page,active){events.push((active?'activate:':'deactivate:')+page.id);if(active&&page.id==='workspaces')flow.ready(page);},
    measure(page){events.push('measure:'+page.id);},openShell(){events.push('open-shell');},
    closeShell(){events.push('close-shell');},cleanup(page){events.push('cleanup:'+page.id);}
};
flow=new PageFlow(adapter,s,R);flow.open('calendar');
check(events.join(',')==='open-shell'&&clock.jobs.size===1,'cold click shows stable shell before page construction/measurement');
clock.flush();check(events.includes('build:calendar')&&flow.stats.measurements===1,'cold page constructs then measures once');
let builds=flow.stats.builds, measures=flow.stats.measurements;
for(let i=0;i<100;i++)flow.switch('calendar');clock.flush();
check(flow.stats.builds===builds&&flow.stats.measurements===measures,'same tab is an actual production no-op');
flow.switch('timer');flow.switch('calendar');clock.flush();
check(!cache.has('timer')&&events[events.length-1]==='measure:calendar','returning to current page cancels pending other-page build');
flow.switch('workspaces');clock.flush();
check(flow.stats.measurements===measures+1,'workspace ready and present coalesce into one page measurement');
let workspace=cache.get('workspaces'), cleanups=flow.stats.cleanups;
flow.close();
check(events[events.length-2]==='close-shell'&&events[events.length-1]==='deactivate:workspaces','close responds before expensive hidden cleanup');
check(flow.stats.cleanups===cleanups,'close cleanup is deferred out of input handler');
flow.open('workspaces');clock.flush();
check(flow.stats.cleanups===cleanups&&!events.includes('cleanup:workspaces'),'quick reopen cancels pending clone cleanup');
flow.ready(workspace);flow.close();clock.flush();
check(flow.stats.cleanups===cleanups+1,'closed page eventually cleans its clones');
let afterClose=flow.stats.measurements;flow.ready(workspace);clock.flush();
check(flow.stats.measurements===afterClose,'closed page cannot execute late ready measurement');
flow.open('calendar');let eventCount=events.length;
check(events[eventCount-1]==='activate:calendar'&&!events.slice(eventCount-3).includes('build:calendar'),'cached page presents immediately');
flow.close();flow.destroy();clock.flush();
print('Production dock/page controllers passed: fixed-plan dedup, cached/same-tab behavior, shell-first construction, one ready measure, deferred/cancelled cleanup.');

let reopenClock=scheduler(), reopenCache=new Map([['calendar',{id:'calendar'}]]), reopenMeasures=0;
let reopenFlow=new PageFlow({cached:id=>reopenCache.get(id),build(){throw new Error('already cached');},
    present(){},activate(){},measure(){reopenMeasures++;},openShell(){},closeShell(){},cleanup(){}},
    {schedule:cb=>reopenClock.schedule(cb),cancel:id=>reopenClock.cancel(id)},R);
reopenFlow.open('calendar');reopenClock.flush();reopenFlow.close();reopenClock.flush();
let measuredBefore=reopenMeasures;
reopenFlow.open('calendar');reopenClock.flush();
check(reopenMeasures===measuredBefore+1,'cached reopen remeasures once after possible hidden theme/monitor changes');
reopenFlow.switch('calendar');reopenClock.flush();
check(reopenMeasures===measuredBefore+1,'same-tab click remains a no-op while already open');
reopenFlow.destroy();

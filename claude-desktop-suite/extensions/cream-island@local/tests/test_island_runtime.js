imports.searchPath.unshift('.');
const State = imports.modules.islandState.IslandState;
const R = imports.modules.runtime;
function check(value, message) { if (!value) throw new Error(message); }
function clock() {
    let now = 0, sequence = 0, tasks = new Map(), cancelled = [];
    return { tasks, cancelled,
        after(ms, callback) { let id = ++sequence; tasks.set(id, { at: now + ms, callback }); return id; },
        schedule(callback) { return this.after(0, callback); },
        cancel(id) { if (tasks.has(id)) cancelled.push(tasks.get(id).callback); tasks.delete(id); },
        advance(ms) {
            let until = now + ms;
            while (true) {
                let due = Array.from(tasks.entries()).filter(([id, task]) => task.at <= until).sort((a,b) => a[1].at - b[1].at)[0];
                if (!due) break;
                now = due[1].at; tasks.delete(due[0]); due[1].callback();
            }
            now = until;
        }
    };
}
let c = clock(), snapshots = [], state = new State(c, value => snapshots.push(value));
check(state.snapshot().mode === 'idle', 'silent island starts idle');
state.notification({ id: 1, summary: 'first', show: false });
check(c.tasks.size === 0 && state.snapshot().unread === 1, 'added counts without a banner timer');
state.notification({ id: 1, summary: 'first', show: true });
check(c.tasks.size === 1 && state.snapshot().mode === 'notification', 'show creates one expiry');
c.advance(4000);
state.notification({ id: 2, summary: 'latest', show: true });
check(c.tasks.size === 1, 'burst replaces the single timer');
c.cancelled[0]();
check(state.snapshot().title === 'latest', 'stale expiry cannot clear a new banner');
c.advance(4999); check(state.snapshot().mode === 'notification', 'new notification extends for full five seconds');
c.advance(1); check(state.snapshot().mode === 'idle' && state.snapshot().unread === 2, 'expires to ball state retaining unread count');
state.media('music', true);
let count = snapshots.length;
for (let i = 0; i < 1000; i++) state.media('music', true);
check(snapshots.length === count, '1000 identical media snapshots do not publish');
state.notification({ id: 3, summary: 'private new message', show: true });
check(state.snapshot().mode === 'media' && state.snapshot().title === 'music', 'notification cannot interrupt music title');
c.advance(5000); check(state.snapshot().mode === 'media', 'music remains after notification five seconds');
state.media('', false); check(state.snapshot().mode === 'idle' && state.snapshot().unread === 3, 'music end retains unread count without an indefinite banner');
state.privacy(false, true);
state.notification({ id: 4, summary: 'DND secret', show: true });
check(!state.snapshot().title && c.tasks.size === 0, 'DND suppresses details');
state.media('sensitive music', true); state.privacy(true, false);
state.notification({ id: 5, summary: 'locked secret', show: true });
check(state.snapshot().mode === 'locked' && !state.snapshot().title && !state.snapshot().unread, 'lock hides text and badges');
state.privacy(false, false); state.open(true);
check(state.snapshot().mode === 'open', 'popup state takes priority');
state.open(false); check(state.snapshot().mode === 'media', 'closing popup restores active media');
state.media('', false); state.notification({ id: 6, summary: 'last', show: true });
count = snapshots.length; state.destroy();
c.cancelled.forEach(callback => callback()); c.advance(20000); state.media('late', true);
check(snapshots.length === count && c.tasks.size === 0, 'destroy cancels all work and ignores stale callbacks');
let idleClock = clock();
let coalesced = 0;
let idle = new R.Coalescer(callback => idleClock.after(0, callback), id => idleClock.cancel(id), () => coalesced++);
for (let i=0;i<1000;i++) idle.request();
check(idleClock.tasks.size === 1, 'burst has one idle callback');
idleClock.advance(0); check(coalesced === 1, 'burst executes once');
idle.request(); idle.destroy(); idleClock.advance(0); check(coalesced === 1, 'destroy cancels pending idle');
let removed = 0, actor = { remove_all_transitions() { removed++; } }, guard = new R.TransitionGuard(actor);
let closeToken = guard.begin(), reopenToken = guard.begin(), hidden = 0;
if (guard.current(closeToken)) hidden++;
check(!hidden && guard.current(reopenToken), 'rapid reopen invalidates old close onComplete');
guard.destroy(); check(!guard.current(reopenToken) && removed === 3, 'destroy invalidates settle callbacks');
check(!R.isBilibiliProcess('/usr/bin/chromium\0--app=io.github.msojocs.bilibili', '/usr/bin/chromium'), 'browser args cannot spoof identity');
check(!R.isBilibiliProcess('/usr/bin/electron\0/opt/apps/io.github.msojocs.bilibili/app', '/usr/bin/electron'), 'generic electron executable cannot prove app identity');
check(R.isBilibiliProcess('/opt/apps/io.github.msojocs.bilibili/files/bin/electron\0app', ''), 'package executable accepted');
print('Production state/runtime passed: expiry bursts, media conflicts/dedup, privacy, transition interruption, destroy.');

let deliveryClock = clock(), delivered = [];
let delivery = new R.LatestDelivery(callback => deliveryClock.after(0, callback),
    id => deliveryClock.cancel(id), value => delivered.push(value));
for (let i=0; i<1000; i++) delivery.push({ unread: i });
check(deliveryClock.tasks.size === 1, 'production latest-state UI delivery schedules one idle for burst');
deliveryClock.advance(0);
check(delivered.length === 1 && delivered[0].unread === 999, 'UI receives newest state only');
delivery.push({ unread: 1000 }); delivery.destroy(); deliveryClock.advance(0);
check(delivered.length === 1, 'UI delivery stops on destroy');

let replaceClock = clock(), replaceState = new State(replaceClock, () => {});
replaceState.notification({ id: 1, summary: 'reused notification', show: true });
replaceState.acknowledge();
replaceState.notification({ id: 1, summary: 'reused notification', show: true });
check(replaceState.snapshot().unread === 1 && replaceState.snapshot().mode === 'notification' && replaceClock.tasks.size === 1,
    'acknowledged notification ID can be reused and show a fresh prompt');
replaceState.destroy();

let pauseClock=clock(), pausedState=new State(pauseClock,()=>{});
pausedState.media('retained media-page title',false);
check(pausedState.snapshot().mode==='idle'&&!pausedState.snapshot().title,'state requires Playing, not just retained title');
pausedState.notification({id:99,summary:'new notification while paused',show:true});
check(pausedState.snapshot().mode==='notification','paused media does not suppress a valid notification');
pausedState.destroy();

/* pactl 13 text protocol, always queried with LC_ALL=C. No titles are retained. */
var parse = function(text, sourceIndex) {
    let running=[];
    String(text).split(/(?=^Source Output #\d+)/m).forEach(block=>{
        let id=/^Source Output #(\d+)/m.exec(block), source=/^\s*Source:\s*(\d+)\s*$/m.exec(block);
        let corked=/^\s*Corked:\s*(yes|no)\s*$/m.exec(block),mute=/^\s*Mute:\s*(yes|no)\s*$/m.exec(block);
        let app=/^\s*application\.id\s*=\s*"([^"\n]*)"/m.exec(block);
        if(!id||!source||!corked||!mute)return;
        if(app&&['org.gnome.VolumeControl','org.PulseAudio.pavucontrol','cream-island-level@local'].includes(app[1]))return;
        if(Number(source[1])===sourceIndex&&corked[1]==='no'&&mute[1]==='no')running.push(Number(id[1]));
    });
    return running.sort((a,b)=>a-b);
};

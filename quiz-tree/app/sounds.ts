'use client';
let context:AudioContext|undefined;
export function unlockAudio(){try{context ||= new AudioContext();if(context.state==='suspended')void context.resume()}catch{}}
export function playCue(cue:'start'|'submit'|'correct'|'wrong'|'tick'|'finish'){
 try{if(!context||context.state!=='running')return;const ctx=context,start=ctx.currentTime;
 const notes=cue==='correct'?[660,880,1047]:cue==='wrong'?[196,155]:cue==='start'?[880,1320,1760]:cue==='finish'?[523,659,784,1047,784,1047]:cue==='tick'?[1000]:[540,700];
 notes.forEach((pitch,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=cue==='wrong'?'triangle':'sine';o.frequency.value=pitch;o.connect(g);g.connect(ctx.destination);const t=start+i*.10;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.055,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.15);o.start(t);o.stop(t+.17)});
 if(cue==='finish'){for(let i=0;i<10;i++){const buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*.09),ctx.sampleRate),samples=buffer.getChannelData(0);for(let j=0;j<samples.length;j++)samples[j]=(Math.random()*2-1)*Math.pow(1-j/samples.length,3);const source=ctx.createBufferSource(),g=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=850;source.buffer=buffer;source.connect(filter);filter.connect(g);g.connect(ctx.destination);g.gain.value=.07;source.start(start+.7+i*.09)}}
 }catch{}
}

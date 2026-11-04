export type QuizMode='mixed'|'initial';
export const initials=(s:string)=>[...s].map(ch=>{const n=ch.charCodeAt(0)-44032;return n>=0&&n<11172?'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]:ch}).join('');
export function generateQuestions(text:string,count:number,mode:QuizMode){
 const lines=text.split(/[\n.!?。]+/).map(x=>x.trim()).filter(x=>x.length>=15&&x.length<=300);
 const pool=lines.map(s=>{
  const terms=s.match(/[가-힣A-Za-z0-9]{2,}/g)||[];
  const choices=mode==='initial'?terms.filter(w=>/^[가-힣]{2,}$/.test(w)):terms;
  const word=choices.find(w=>w.length>=3&&w.length<=12)||choices[0]||'';
  return {s,word};
 }).filter(x=>x.word);
 const questions=pool.slice(0,count).map(({s,word},i)=>{
  const blank=s.replace(word,'(      )');const base={prompt:blank,answer:word,options:[] as string[],explanation:s};
  if(mode==='initial'||i%4===0)return {...base,type:'초성',prompt:blank+'\n초성 힌트: '+initials(word)};
  if(i%4===1)return {...base,type:'O/X',prompt:'자료와 일치하는 문장인가요?\n'+s,options:['O','X'],answer:'O'};
  if(i%4===2){const distractors=[...new Set(pool.map(p=>p.word).filter(w=>w!==word))].slice(0,3);if(distractors.length<2)return {...base,type:'주관식'};return {...base,type:'객관식',options:[word,...distractors].sort(()=>Math.random()-.5)}}
  return {...base,type:'주관식'};
 });
 return {questions,available:pool.length};
}

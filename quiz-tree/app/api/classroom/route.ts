import {env} from 'cloudflare:workers';
import {raceScores} from '../../../lib/race';
export const dynamic='force-dynamic';
const uid=()=>crypto.randomUUID();
const clean=(s:any)=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ');
const norm=(s:any)=>clean(s).toLowerCase().replace(/[\s.,!?·]/g,'');
const fail=(m:string,status=400)=>{throw Object.assign(new Error(m),{status});};
function safe(c:any,host:boolean,token:string){
 const r=c.round;const me=Object.values(c.students).find((s:any)=>s.tokens.includes(token)) as any;
 const people=Object.values(c.students).map((s:any)=>({id:s.id,name:s.name,confirmed:s.confirmed,total:c.history.reduce((n:number,h:any)=>n+(h.scores[s.id]?.score||0),0)}));
 const scores=r?raceScores(r):{};
 const q=r?.questions[r.index]; const revealed=r&&r.phase!=='question';
 return {id:c.id,title:c.title,people,me:me?{id:me.id,name:me.name,confirmed:me.confirmed}:null,host,quiz:host?c.quiz:undefined,history:c.history,round:r?{id:r.id,title:r.title,phase:r.phase,index:r.index,count:r.questions.length,deadline:r.deadline,participants:r.participants,seconds:r.seconds,scores,question:q?{type:q.type,prompt:q.prompt,options:q.options,...(revealed||host?{answer:q.answer,explanation:q.explanation}: {})}:null,myAnswer:me?r.answers[me.id]?.[r.index]:null}:null,now:Date.now()};
}
async function handler(req:Request){
 const requestAt=Date.now();const db=(env as any).DB;const url=new URL(req.url);const token=req.headers.get('x-student-token')||'';const owner=req.headers.get('oai-authenticated-user-id');
 const b:any=req.method==='POST'?await req.json():{};const id=b.id||url.searchParams.get('id');const action=b.action;
 if(action==='create'){
  if(!owner)fail('선생님 로그인 후 수업을 만들 수 있습니다.',401);
  const id=uid();const c={id,title:clean(b.title).slice(0,80)||'우리 반 퀴즈런',students:{},next:1,quiz:[],round:null,history:[]};
  await db.prepare('INSERT INTO classrooms (id,owner,data,revision) VALUES (?,?,?,0)').bind(id,owner,JSON.stringify(c)).run();return Response.json(safe(c,true,''));
 }
 if(!id&&req.method==='GET'&&url.searchParams.get('mine')==='1'){if(!owner)fail('선생님 로그인 후 확인할 수 있습니다.',401);const rows=await db.prepare('SELECT id,data FROM classrooms WHERE owner=?').bind(owner).all();return Response.json({rooms:rows.results.map((row:any)=>({id:row.id,title:JSON.parse(row.data).title}))},{headers:{'Cache-Control':'no-store'}});}
 if(!id)fail('수업 링크를 확인해 주세요.');
 for(let attempt=0;attempt<60;attempt++){
  const row=await db.prepare('SELECT * FROM classrooms WHERE id=?').bind(id).first();if(!row)fail('수업을 찾을 수 없습니다.',404);
  const c=JSON.parse(row.data);const host=!!owner&&owner===row.owner;const student=Object.values(c.students).find((s:any)=>s.tokens.includes(token)) as any;
  let changed=false;let out:any={};const r=c.round;
  if(r?.phase==='question'&&Date.now()>=r.deadline){r.phase='reveal';r.questionEnds ||= [];r.questionEnds[r.index]=r.deadline;changed=true;}
  if(req.method==='POST'){
   if(['save','start','next','finish'].includes(action)&&!host)fail('선생님만 진행할 수 있습니다.',403);
   if(action==='join'){
    const name=clean(b.name);if(name.length<1||name.length>20)fail('이름을 1~20자로 입력해 주세요.');
    let s=Object.values(c.students).find((s:any)=>s.name===name) as any;
    if(!s){s={id:c.next++,name,confirmed:false,tokens:[]};c.students[s.id]=s;}
    const t=uid();s.tokens.push(t);s.tokens=s.tokens.slice(-8);out.token=t;changed=true;
   }else if(action==='confirm'){
    if(!student)fail('이름을 다시 입력해 주세요.',401);student.confirmed=true;
    if(r&&r.phase!=='finished'&&!r.participants.includes(student.id)){
     if(r.phase!=='lobby')fail('게임이 시작되었습니다. 다음 게임에 참여해 주세요.');
     r.participants.push(student.id);
    }changed=true;
   }else if(action==='save'){
    if(r&&r.phase!=='finished'&&r.phase!=='lobby')fail('게임 종료 후 문제를 수정해 주세요.');
    const qs=b.questions;if(!Array.isArray(qs)||!qs.length||qs.length>50)fail('문제는 1~50개로 설정해 주세요.');
    c.quiz=qs.map((q:any)=>{if(!['초성','O/X','객관식','주관식'].includes(q.type)||!clean(q.prompt)||!clean(q.answer))fail('문제와 정답을 모두 입력해 주세요.');const options=Array.isArray(q.options)?q.options.map(clean).slice(0,4):[];if(['O/X','객관식'].includes(q.type)&&(!options.includes(clean(q.answer))||options.length<2))fail('선택지에 정답을 포함해 주세요.');return {type:q.type,prompt:clean(q.prompt).slice(0,1000),answer:clean(q.answer).slice(0,200),options,explanation:clean(q.explanation).slice(0,1000)}});changed=true;
   }else if(action==='start'){
    if(r&&r.phase!=='finished')fail('진행 중인 게임을 먼저 끝내 주세요.');if(!c.quiz.length)fail('먼저 문제를 준비해 주세요.');
    c.round={id:uid(),title:clean(b.title)||'오늘의 도전',questions:c.quiz,index:0,phase:'lobby',deadline:0,seconds:Math.max(10,Math.min(180,Number(b.seconds)||30)),participants:[],answers:{},questionStarts:[],questionEnds:[]};changed=true;
   }else if(action==='next'){
    if(!r||r.phase==='finished')fail('대기실을 먼저 열어 주세요.');
    if(r.phase==='question'){r.phase='reveal';r.questionEnds ||= [];r.questionEnds[r.index]=Date.now();}else{if(!r.participants.length)fail('학생 참여를 기다려 주세요.');if(r.phase==='reveal')r.index++;if(r.index>=r.questions.length){complete(c);}else{r.phase='question';r.questionStarts ||= [];r.questionStarts[r.index]=Date.now();r.deadline=r.questionStarts[r.index]+r.seconds*1000;}}changed=true;
   }else if(action==='finish'){
    if(!r||r.phase==='finished')fail('진행 중인 게임이 없습니다.');complete(c);changed=true;
   }else if(action==='answer'){
    if(!student?.confirmed||!r?.participants.includes(student.id))fail('참여 확인 후 답할 수 있습니다.',403);
    if(r.phase!=='question'||r.id!==b.roundId||r.index!==b.index||Date.now()>=r.deadline)fail('답안 제출 시간이 끝났습니다.');
    r.answers[student.id] ||= {};if(r.answers[student.id][r.index])fail('이미 제출한 답입니다.');
    const answer=clean(b.answer).slice(0,200);const correct=r.questions[r.index].answer.split('|').some((a:string)=>norm(a)===norm(answer));
    const receivedAt=requestAt;const startedAt=r.questionStarts?.[r.index]??r.deadline-r.seconds*1000;
    r.answers[student.id][r.index]={answer,correct,points:correct?1000:0,at:receivedAt,elapsedMs:Math.min(r.seconds*1000,Math.max(0,receivedAt-startedAt))};changed=true;
   }else if(action!=='join'&&!['confirm','save','start','next','finish'].includes(action))fail('알 수 없는 요청입니다.');
  }
  if(changed){const res=await db.prepare('UPDATE classrooms SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(c),id,row.revision).run();if(!res.meta.changes)continue;}
  return Response.json({...safe(c,host,out.token||token),...out},{headers:{'Cache-Control':'no-store'}});
 }
 fail('다른 참여자와 동기화 중입니다. 다시 시도해 주세요.',409);
}
function complete(c:any){
 const r=c.round;if(r.phase==='finished')return;
 r.finishedAt=Date.now();r.questionEnds ||= [];
 if(r.phase==='question')r.questionEnds[r.index]=Math.min(r.deadline,r.finishedAt);
 r.phase='finished';const scores:any=raceScores(r,r.finishedAt);
 Object.values(scores).forEach((s:any)=>s.total=r.questions.length);
 c.history.push({id:r.id,title:r.title,date:new Date().toLocaleString('sv-SE',{timeZone:'Asia/Seoul'}),scores});
}
export async function GET(req:Request){try{return await handler(req)}catch(e:any){return Response.json({error:e.message},{status:e.status||500})}}
export async function POST(req:Request){try{if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'요청 출처를 확인해 주세요.'},{status:403});return await handler(req)}catch(e:any){return Response.json({error:e.message},{status:e.status||500})}}

import {env} from 'cloudflare:workers';
import {raceScores} from '../../../lib/race';
import {monthlySummary,nameKey,visibleStudent,deletedAt,recordTime} from '../../../lib/monthly';
export const dynamic='force-dynamic';
const uid=()=>crypto.randomUUID();
const clean=(s:any)=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ');
const norm=(s:any)=>clean(s).toLowerCase().replace(/[\s.,!?·]/g,'');
const fail=(m:string,status=400)=>{throw Object.assign(new Error(m),{status});};
function safe(c:any,host:boolean,token:string,summary:any={people:[],month:''},state:any={}){
 const r=c.round?{...c.round,participants:c.round.participants.filter((id:number)=>c.students[id]&&visibleStudent(c.students[id],state))}:null;const me=Object.values(c.students).find((s:any)=>s.tokens.includes(token)&&visibleStudent(s,state)) as any;
 const people=Object.values(c.students).filter((s:any)=>visibleStudent(s,state)).map((s:any)=>({id:s.id,name:s.name,confirmed:s.confirmed,total:summary.people.find((p:any)=>p.key===nameKey(s.name))?.total||0}));
 const scores=r?raceScores(r):{};
 const q=r?.questions[r.index]; const revealed=r&&r.phase!=='question';
 return {id:c.id,title:c.title,month:summary.month,monthlyPeople:host?summary.people:undefined,pin:c.pin||null,people,me:me?{id:me.id,name:me.name,confirmed:me.confirmed}:null,host,quizMode:c.quizMode||'mixed',quiz:host?c.quiz:undefined,history:c.history.map((h:any)=>({...h,scores:Object.fromEntries(Object.entries(h.scores).filter(([id])=>{const n=h.names?.[id]||c.students[id]?.name;return n&&recordTime(h)>deletedAt(state,n)}))})),round:r?{id:r.id,title:r.title,phase:r.phase,index:r.index,count:r.questions.length,deadline:r.deadline,quizMode:r.quizMode||'mixed',participants:r.participants,seconds:r.seconds,scores,question:q?{type:q.type,prompt:q.prompt,options:q.options,image:q.image||null,...(revealed||host?{answer:q.answer,explanation:q.explanation}: {})}:null,myAnswer:me?r.answers[me.id]?.[r.index]:null}:null,now:Date.now()};
}
async function handler(req:Request){
 const requestAt=Date.now();const db=(env as any).DB;const url=new URL(req.url);const token=req.headers.get('x-student-token')||'';const owner=req.headers.get('oai-authenticated-user-id');
 const b:any=req.method==='POST'?await req.json():{};const id=b.id||url.searchParams.get('id');const action=b.action;
 if(action==='create'){
  if(!owner)fail('선생님 로그인 후 수업을 만들 수 있습니다.',401);
  const id=uid();const c={id,title:clean(b.title).slice(0,80)||'우리 반 퀴즈런',students:{},next:1,quiz:[],round:null,history:[]};
  await db.prepare('INSERT INTO classrooms (id,owner,data,revision) VALUES (?,?,?,0)').bind(id,owner,JSON.stringify(c)).run();return Response.json(await responseData(db,c,owner!,true,''));
 }
 if(!id&&req.method==='GET'&&url.searchParams.get('mine')==='1'){if(!owner)fail('선생님 로그인 후 확인할 수 있습니다.',401);const rows=await db.prepare('SELECT id,data FROM classrooms WHERE owner=?').bind(owner).all();return Response.json({rooms:rows.results.map((row:any)=>({id:row.id,title:JSON.parse(row.data).title}))},{headers:{'Cache-Control':'no-store'}});}
 if(action==='lookupPin'){
  const pin=clean(b.pin).replace(/\s/g,'');if(!/^\d{6}$/.test(pin))fail('PIN 번호 6자리를 입력해 주세요.');
  const match=await db.prepare('SELECT room FROM room_pins WHERE pin=?').bind(pin).first();if(!match)fail('PIN 번호를 찾을 수 없습니다. 선생님이 알려 주신 번호를 확인해 주세요.',404);
  return Response.json({id:match.room},{headers:{'Cache-Control':'no-store'}});
 }
 if(!id)fail('수업 링크를 확인해 주세요.');
 for(let attempt=0;attempt<60;attempt++){
  const row=await db.prepare('SELECT * FROM classrooms WHERE id=?').bind(id).first();if(!row)fail('수업을 찾을 수 없습니다.',404);
  const c=JSON.parse(row.data);const stateRow=await db.prepare('SELECT * FROM teacher_state WHERE owner=?').bind(row.owner).first();const state=stateRow?JSON.parse(stateRow.data):{};const host=!!owner&&owner===row.owner;const student=Object.values(c.students).find((s:any)=>s.tokens.includes(token)&&visibleStudent(s,state)) as any;
  let changed=false;let out:any={};const r=c.round;
  if(r?.phase==='question'&&Date.now()>=r.deadline){r.phase='reveal';r.questionEnds ||= [];r.questionEnds[r.index]=r.deadline;changed=true;}
  if(req.method==='POST'){
   if(['save','start','next','finish','invite','resetScores','deleteStudents'].includes(action)&&!host)fail('선생님만 진행할 수 있습니다.',403);
   if(action==='resetScores'||action==='deleteStudents'){
    if(r&&r.phase!=='finished'&&r.phase!=='lobby')fail('경기가 끝난 뒤 점수를 리셋하거나 학생을 삭제해 주세요.');
    const target=b.all?null:clean(b.name);if(!b.all&&!target)fail('학생을 선택해 주세요.');
    const owned=await db.prepare('SELECT id,data FROM classrooms WHERE owner=?').bind(row.owner).all();if(owned.results.some((item:any)=>{const round=JSON.parse(item.data).round;return round&&round.phase!=='finished'&&round.phase!=='lobby'}))fail('진행 중인 경기가 있습니다. 모든 경기를 마친 뒤 관리해 주세요.');
    await updateTeacherState(db,row.owner,action,target,Date.now());
    if(action==='deleteStudents')await purgeStudents(db,row.owner,target);
    const fresh=await db.prepare('SELECT * FROM classrooms WHERE id=?').bind(id).first();
    return Response.json(await responseData(db,JSON.parse(fresh.data),row.owner,host,token),{headers:{'Cache-Control':'no-store'}});
   }else if(action==='invite'){c.pin=await ensurePin(db,c.id);changed=true;}else if(action==='join'){
    const name=clean(b.name);if(name.length<1||name.length>20)fail('이름을 1~20자로 입력해 주세요.');
    let s=Object.values(c.students).find((s:any)=>nameKey(s.name)===nameKey(name)&&visibleStudent(s,state)) as any;
    if(!s){s={id:c.next++,name,confirmed:false,tokens:[],createdAt:Date.now()};c.students[s.id]=s;}
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
    const quizMode=b.quizMode==='initial'?'initial':'mixed';
    if(quizMode==='initial'&&qs.some((q:any)=>q.type!=='초성'))fail('초성퀴즈만 모드에서는 초성 문제만 저장할 수 있습니다.');
    c.quizMode=quizMode;
    c.quiz=qs.map((q:any)=>{if(!['초성','O/X','객관식','주관식'].includes(q.type)||!clean(q.prompt)||!clean(q.answer))fail('문제와 정답을 모두 입력해 주세요.');const options=Array.isArray(q.options)?q.options.map(clean).slice(0,4):[];if(['O/X','객관식'].includes(q.type)&&(!options.includes(clean(q.answer))||options.length<2))fail('선택지에 정답을 포함해 주세요.');return {type:q.type,prompt:clean(q.prompt).slice(0,1000),answer:clean(q.answer).slice(0,200),options,image:validateImage(q.image,c.id),explanation:clean(q.explanation).slice(0,1000)}});if(r?.phase==='lobby'){r.questions=c.quiz;r.quizMode=quizMode;}changed=true;
   }else if(action==='start'){
    if(r&&r.phase!=='finished')fail('진행 중인 게임을 먼저 끝내 주세요.');if(!c.quiz.length)fail('먼저 문제를 준비해 주세요.');
    c.pin=await ensurePin(db,c.id);
    c.round={id:uid(),title:clean(b.title)||'오늘의 도전',questions:c.quiz,quizMode:c.quizMode||'mixed',index:0,phase:'lobby',deadline:0,seconds:Math.max(10,Math.min(180,Number(b.seconds)||30)),participants:[],answers:{},questionStarts:[],questionEnds:[]};changed=true;
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
   }else if(action!=='join'&&!['confirm','save','start','next','finish','invite'].includes(action))fail('알 수 없는 요청입니다.');
  }
  if(changed){const res=await db.prepare('UPDATE classrooms SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(c),id,row.revision).run();if(!res.meta.changes)continue;}
  return Response.json({...await responseData(db,c,row.owner,host,out.token||token),...out},{headers:{'Cache-Control':'no-store'}});
 }
 fail('다른 참여자와 동기화 중입니다. 다시 시도해 주세요.',409);
}
async function responseData(db:any,c:any,owner:string,host:boolean,token:string){
 const [all,stateRow]=await Promise.all([db.prepare('SELECT id,data FROM classrooms WHERE owner=?').bind(owner).all(),db.prepare('SELECT * FROM teacher_state WHERE owner=?').bind(owner).first()]);
 const state=stateRow?JSON.parse(stateRow.data):{};const rooms=all.results.filter((r:any)=>r.id!==c.id).map((r:any)=>JSON.parse(r.data));rooms.push(c);
 return safe(c,host,token,monthlySummary(rooms,state),state);
}
async function updateTeacherState(db:any,owner:string,action:string,target:string|null,at:number){
 await db.prepare('INSERT OR IGNORE INTO teacher_state (owner,data,revision) VALUES (?, ?, 0)').bind(owner,'{}').run();
 for(let i=0;i<60;i++){
  const row=await db.prepare('SELECT * FROM teacher_state WHERE owner=?').bind(owner).first();const state=JSON.parse(row.data);
  if(action==='resetScores'){if(target){state.resets ||= {};state.resets[nameKey(target)]=at;}else state.allResetAt=at;}
  else{if(target){state.deleted ||= {};state.deleted[nameKey(target)]=at;}else state.allDeletedAt=at;}
  const result=await db.prepare('UPDATE teacher_state SET data=?,revision=revision+1 WHERE owner=? AND revision=?').bind(JSON.stringify(state),owner,row.revision).run();if(result.meta.changes)return;
 }
 fail('다른 변경과 동기화 중입니다. 다시 시도해 주세요.',409);
}
async function purgeStudents(db:any,owner:string,target:string|null){
 const rows=await db.prepare('SELECT id,data FROM classrooms WHERE owner=?').bind(owner).all();
 for(const item of rows.results){for(let i=0;i<60;i++){
  const row=await db.prepare('SELECT * FROM classrooms WHERE id=?').bind(item.id).first();const c=JSON.parse(row.data);
  const removed=new Set(Object.values(c.students).filter((s:any)=>!target||nameKey(s.name)===nameKey(target)).map((s:any)=>String(s.id)));
  for(const id of removed)delete c.students[id as string];
  c.history=target?c.history.map((h:any)=>({...h,scores:Object.fromEntries(Object.entries(h.scores).filter(([id])=>!removed.has(id)&&(!target||nameKey(h.names?.[id])!==nameKey(target)))),names:Object.fromEntries(Object.entries(h.names||{}).filter(([id])=>!removed.has(id)))})):[];
  if(c.round){c.round.participants=c.round.participants.filter((id:number)=>!removed.has(String(id)));for(const id of removed)delete c.round.answers[id as string];}
  const done=await db.prepare('UPDATE classrooms SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(c),c.id,row.revision).run();if(done.meta.changes)break;if(i===59)fail('일부 학생 삭제를 마치지 못했습니다. 다시 시도해 주세요.',409);
 }}
}
function validateImage(image:any,id:string){
 if(!image)return null;
 if(typeof image!=='string'||!image.startsWith('/api/image?room='+encodeURIComponent(id)+'&key=')||!/^[-a-z0-9.]+$/.test(image.split('&key=')[1]||''))fail('문제 이미지를 다시 첨부해 주세요.');
 return image;
}
async function ensurePin(db:any,id:string){
 for(let i=0;i<12;i++){
  const found=await db.prepare('SELECT pin FROM room_pins WHERE room=?').bind(id).first();if(found)return found.pin;
  const pin=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000);
  await db.prepare('INSERT OR IGNORE INTO room_pins (pin,room) VALUES (?,?)').bind(pin,id).run();
 }
 fail('입장 PIN 생성 중입니다. 다시 시도해 주세요.',409);
}
function complete(c:any){
 const r=c.round;if(r.phase==='finished')return;
 r.finishedAt=Date.now();r.questionEnds ||= [];
 if(r.phase==='question')r.questionEnds[r.index]=Math.min(r.deadline,r.finishedAt);
 r.phase='finished';const scores:any=raceScores(r,r.finishedAt);
 Object.values(scores).forEach((s:any)=>s.total=r.questions.length);
 c.history.push({id:r.id,title:r.title,at:r.finishedAt,names:Object.fromEntries(r.participants.map((id:number)=>[id,c.students[id]?.name])),date:new Date().toLocaleString('sv-SE',{timeZone:'Asia/Seoul'}),scores});
}
export async function GET(req:Request){try{return await handler(req)}catch(e:any){return Response.json({error:e.message},{status:e.status||500})}}
export async function POST(req:Request){try{if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'요청 출처를 확인해 주세요.'},{status:403});return await handler(req)}catch(e:any){return Response.json({error:e.message},{status:e.status||500})}}

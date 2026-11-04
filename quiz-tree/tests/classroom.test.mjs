// Behavioral tests for the server route. D1's revision lease is emulated in memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
class MemoryD1 {
 rows=new Map();pins=new Map();states=new Map();
 prepare(sql){
  const db=this;
  return {bind(...args){return {
   async first(){if(sql.includes('teacher_state'))return structuredClone(db.states.get(args[0])||null);if(sql.includes('room_pins')){if(sql.includes('WHERE pin='))return db.pins.has(args[0])?{room:db.pins.get(args[0])}:null;const match=[...db.pins.entries()].find(([pin,room])=>room===args[0]);return match?{pin:match[0]}:null;}return structuredClone(db.rows.get(args[0])||null);},
   async all(){return {results:[...db.rows.values()].filter(r=>r.owner===args[0])};},
   async run(){
    if(sql.includes('teacher_state')){if(sql.startsWith('INSERT')){if(!db.states.has(args[0]))db.states.set(args[0],{owner:args[0],data:args[1],revision:0});return {meta:{changes:1}}}const state=db.states.get(args[1]);if(state.revision!==args[2])return {meta:{changes:0}};state.data=args[0];state.revision++;return {meta:{changes:1}};}
    if(sql.includes('room_pins')){if(db.pins.has(args[0])||[...db.pins.values()].includes(args[1]))return {meta:{changes:0}};db.pins.set(args[0],args[1]);return {meta:{changes:1}};}
    if(sql.startsWith('INSERT')){
     db.rows.set(args[0],{id:args[0],owner:args[1],data:args[2],revision:0});
     return {meta:{changes:1}};
    }
    const row=db.rows.get(args[1]);
    if(row.revision!==args[2])return {meta:{changes:0}};
    row.data=args[0];row.revision++;
    return {meta:{changes:1}};
   }
  };}};
 }
}
globalThis.__quizTestEnv={DB:new MemoryD1()};
const raceCode=ts.transpile(fs.readFileSync('lib/race.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const raceUrl='data:text/javascript;base64,'+Buffer.from(raceCode).toString('base64');
const {compareRace,raceScores,raceRank,raceDistance}=await import(raceUrl);
const monthlyCode=ts.transpile(fs.readFileSync('lib/monthly.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const monthlyUrl='data:text/javascript;base64,'+Buffer.from(monthlyCode).toString('base64');
const {monthlySummary,monthKey}=await import(monthlyUrl);
const raw=fs.readFileSync('app/api/classroom/route.ts','utf8').replace(/import \{env\} from 'cloudflare:workers';/, 'const env=globalThis.__quizTestEnv;').replace("'../../../lib/race'",JSON.stringify(raceUrl)).replace("'../../../lib/monthly'",JSON.stringify(monthlyUrl));
const code=ts.transpile(raw,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
let ownerLogin='teacher';let id;async function call(action,extra={},token='',host=true){const response=await POST(new Request('https://quiz.test/api/classroom',{method:'POST',headers:{origin:'https://quiz.test','content-type':'application/json',...(host?{'oai-authenticated-user-id':ownerLogin}:{}),'x-student-token':token},body:JSON.stringify({id,action,...extra})}));return {status:response.status,data:await response.json()}}
const noLogin=await call('create',{},'',false);assert.equal(noLogin.status,401);
const created=await call('create');assert.equal(created.status,200);id=created.data.id;
const questions=[{type:'주관식',prompt:'인공지능의 영문 약자는?',answer:'AI',options:[],explanation:'Artificial Intelligence'}];
assert.equal((await call('save',{questions},'',false)).status,403);
assert.equal((await call('save',{questions})).status,200);
assert.equal((await call('start',{seconds:30})).status,200);
const joined=await Promise.all(Array.from({length:30},(_,i)=>call('join',{name:'학생'+(i+1)},'',false)));
assert(joined.every(x=>x.status===200));assert.equal(new Set(joined.map(x=>x.data.me.id)).size,30);
const confirmations=await Promise.all(joined.map(s=>call('confirm',{},s.data.token,false)));
assert.equal(confirmations.filter(x=>x.status===200).length,30);
const student=joined[0];const sid=student.data.me.id,token=student.data.token;
const again=await call('join',{name:'학생1'},'',false);assert.equal(again.data.me.id,sid);assert.equal(again.data.me.confirmed,true);
const started=await call('next');assert.equal(started.data.round.phase,'question');
const state=await GET(new Request('https://quiz.test/api/classroom?id='+id,{headers:{'x-student-token':token}}));const safe=await state.json();assert.equal(safe.quiz,undefined);assert.equal(safe.round.question.answer,undefined);assert(!JSON.stringify(safe).includes('tokens'));
const submissions=await Promise.all(joined.map(s=>call('answer',{roundId:started.data.round.id,index:0,answer:' ai '},s.data.token,false)));
assert(submissions.every(x=>x.status===200));
assert.equal((await call('answer',{roundId:started.data.round.id,index:0,answer:'AI'},token,false)).status,400);
assert.equal((await call('next',{},token,false)).status,403);
await call('next');const finished=await call('next');assert.equal(finished.data.round.phase,'finished');assert.equal(finished.data.history.length,1);assert.equal(finished.data.people.find(p=>p.id===sid).total,1000);
await call('start',{seconds:15});await call('confirm',{},token,false);const r2=await call('next');await call('answer',{roundId:r2.data.round.id,index:0,answer:'AI'},token,false);const f2=await call('finish');assert.equal(f2.data.history.length,2);assert.equal(f2.data.people.find(p=>p.id===sid).total,2000);
assert.equal((await call('finish')).status,400);
const row=globalThis.__quizTestEnv.DB.rows.get(id);let c=JSON.parse(row.data);c.round.phase='question';c.round.deadline=Date.now()-100;c.round.answers={};row.data=JSON.stringify(c);
assert.equal((await call('answer',{roundId:c.round.id,index:0,answer:'AI'},token,false)).status,400);
const badOrigin=await POST(new Request('https://quiz.test/api/classroom',{method:'POST',headers:{origin:'https://other.test'},body:'{}'}));assert.equal(badOrigin.status,403);
// Equal accuracy is ranked by shorter server-measured time; a fast wrong answer never beats a correct answer.
assert(compareRace({right:2,elapsedMs:5000},{right:2,elapsedMs:9000})<0);
assert(compareRace({right:1,elapsedMs:9000},{right:0,elapsedMs:100})<0);
assert.equal(raceRank([{id:1},{id:2},{id:3}],{1:{right:1,elapsedMs:1000},2:{right:1,elapsedMs:1000},3:{right:1,elapsedMs:2000}},2),1);
assert(raceDistance({right:49,elapsedMs:1500000},50,30)>raceDistance({right:48,elapsedMs:0},50,30));
assert(raceDistance({right:2,elapsedMs:3000},4,30)>raceDistance({right:2,elapsedMs:5000},4,30));
const measured=raceScores({participants:[1,2,3],seconds:30,questionStarts:[1000,5000],questionEnds:[4000,9000],answers:{1:{0:{correct:true,points:1000,at:2000,elapsedMs:1000},1:{correct:true,points:1000,at:7000,elapsedMs:2000}},2:{0:{correct:true,points:1000,at:3000,elapsedMs:2000}},3:{}}},9000);
assert.equal(measured[1].elapsedMs,3000);assert.equal(measured[2].elapsedMs,6000);assert.equal(measured[3].elapsedMs,7000);
assert.equal(finished.data.history[0].scores[sid].elapsedMs,finished.data.round.scores[sid].elapsedMs);
assert.equal(f2.data.round.participants.length,1,'Small-group rehearsal remains possible; 10 is supported capacity, not a start gate');
// Both source-based generation modes and server-side initial-only enforcement.
const questionCode=ts.transpile(fs.readFileSync('lib/questions.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const {generateQuestions,initials}=await import('data:text/javascript;base64,'+Buffer.from(questionCode).toString('base64'));
const source='컴퓨터는 입력받은 명령을 순서대로 실행하는 장치입니다.\n알고리즘은 문제를 해결하기 위한 순서와 절차입니다.\n인공지능은 사람이 하는 판단을 컴퓨터로 구현하는 기술입니다.\n개인정보는 개인을 알아볼 수 있는 소중한 정보입니다.';
const mixed=generateQuestions(source,4,'mixed'),initialOnly=generateQuestions(source,4,'initial');
assert.deepEqual(mixed.questions.map(q=>q.type),['초성','O/X','객관식','주관식']);
assert.equal(initialOnly.questions.length,4);assert(initialOnly.questions.every(q=>q.type==='초성'&&q.options.length===0&&q.prompt.includes('초성 힌트: '+initials(q.answer))));
assert.equal(generateQuestions('An English sentence contains enough words for testing.',4,'initial').questions.length,0);
assert.equal(initials('인공지능'),'ㅇㄱㅈㄴ');
const modeRoom=await call('create');id=modeRoom.data.id;
assert.equal(modeRoom.data.quizMode,'mixed');
assert.equal((await call('save',{questions,quizMode:'initial'})).status,400);
const initialSaved=await call('save',{questions:initialOnly.questions,quizMode:'initial'});
assert.equal(initialSaved.status,200);assert.equal(initialSaved.data.quizMode,'initial');
const initialRound=await call('start');assert.equal(initialRound.data.round.quizMode,'initial');
const mixedSaved=await call('save',{questions:mixed.questions,quizMode:'mixed'});assert.equal(mixedSaved.data.quizMode,'mixed');assert.equal(mixedSaved.data.round.quizMode,'mixed');assert.equal(mixedSaved.data.round.count,4);
// PIN resolves a room without granting teacher rights; old rooms can obtain a stable code.
assert(/^\d{6}$/.test(initialRound.data.pin));
const codeLookup=await call('lookupPin',{pin:initialRound.data.pin},'',false);
assert.equal(codeLookup.status,200);assert.equal(codeLookup.data.id,id);
assert.equal((await call('lookupPin',{pin:'12'},'',false)).status,400);
assert.equal((await call('lookupPin',{pin:'000000'},'',false)).status,404);
assert.equal((await call('invite',{},'',false)).status,403);
assert.equal((await call('invite')).data.pin,initialRound.data.pin);
// Stored image references are scoped to the room and appear in the question sent to students.
const image='/api/image?room='+encodeURIComponent(id)+'&key=abc-123.jpg';
const pictured=initialOnly.questions.map((q,i)=>({...q,...(i===0?{image}:{})}));
assert.equal((await call('save',{questions:pictured,quizMode:'initial'})).data.quiz[0].image,image);
assert.equal((await call('save',{questions:[{...pictured[0],image:'https://external.test/image.svg'}],quizMode:'initial'})).status,400);
const pinStudent=await call('join',{name:'PIN 참여 학생'},'',false);await call('confirm',{},pinStudent.data.token,false);
assert.equal((await call('answer',{roundId:initialRound.data.round.id,index:0,answer:pictured[0].answer},pinStudent.data.token,false)).status,400,'Lobby opening does not start questions');
const opened=await call('next');assert.equal(opened.data.round.question.image,image);
// Image uploads require the room owner and accept raster bytes only.
const bucket=new Map();globalThis.__quizTestEnv.BUCKET={async put(key,bytes,metadata){bucket.set(key,{body:bytes,...metadata})},async get(key){return bucket.get(key)}};
const imageRaw=fs.readFileSync('app/api/image/route.ts','utf8').replace(/import \{env\} from 'cloudflare:workers';/,'const env=globalThis.__quizTestEnv;');
const imageCode=ts.transpile(imageRaw,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const imageAPI=await import('data:text/javascript;base64,'+Buffer.from(imageCode).toString('base64'));
async function uploadImage(owner,bytes,mime='image/png'){const form=new FormData();form.set('room',id);form.set('image',new File([bytes],'test.png',{type:mime}));return imageAPI.POST(new Request('https://quiz.test/api/image',{method:'POST',headers:{origin:'https://quiz.test',...(owner?{'oai-authenticated-user-id':owner}:{})},body:form}));}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
assert.equal((await uploadImage('',png)).status,401);assert.equal((await uploadImage('other-teacher',png)).status,403);
assert.equal((await uploadImage('teacher',Buffer.from('<svg onload="alert(1)"></svg>'),'image/svg+xml')).status,400);
assert.equal((await uploadImage('teacher',new Uint8Array(2*1024*1024+1))).status,400);
const uploaded=await uploadImage('teacher',png);assert.equal(uploaded.status,200);const savedImage=await uploaded.json();
const fetchedImage=await imageAPI.GET(new Request('https://quiz.test'+savedImage.image));assert.equal(fetchedImage.status,200);assert.equal(fetchedImage.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await fetchedImage.arrayBuffer()),png);
const QRCode=(await import('qrcode')).default;const qr=await QRCode.toDataURL('https://quiz.test/?room='+id,{width:300,margin:3});assert(qr.startsWith('data:image/png;base64,'));
// Regression: one teacher's same-name totals follow students into a new room.
ownerLogin='monthly-teacher';
const roomA=await call('create');id=roomA.data.id;
const old=await call('join',{name:'김민수'},'',false);await call('confirm',{},old.data.token,false);
let a=globalThis.__quizTestEnv.DB.rows.get(id),ca=JSON.parse(a.data);ca.history=[{id:'old-round',date:'2026-11-01 09:00:00',at:Date.now()-5000,names:{[old.data.me.id]:'김민수'},scores:{[old.data.me.id]:{score:2000,right:2,total:3}}}];a.data=JSON.stringify(ca);
const roomB=await call('create');id=roomB.data.id;const fresh=await call('join',{name:' 김민수 '},'',false);await call('confirm',{},fresh.data.token,false);
const newRoomState=await GET(new Request('https://quiz.test/api/classroom?id='+id,{headers:{'x-student-token':fresh.data.token}}));assert.equal((await newRoomState.json()).people.find(p=>p.name==='김민수').total,2000);
assert.equal((await call('resetScores',{name:'김민수'},fresh.data.token,false)).status,403);
assert.equal((await call('resetScores',{name:'김민수'})).data.monthlyPeople.find(p=>p.name==='김민수').total,0);
assert.equal(JSON.parse(globalThis.__quizTestEnv.DB.rows.get(roomA.data.id).data).history.length,1,'A reset preserves historical game records');
// A different teacher's record never joins these totals.
const isolated={...ca,id:'other-room',history:[{...ca.history[0],at:Date.now()+100, scores:{[old.data.me.id]:{score:99000}}}]};globalThis.__quizTestEnv.DB.rows.set('other-room',{id:'other-room',owner:'different-teacher',data:JSON.stringify(isolated),revision:0});
assert.equal((await call('invite')).data.monthlyPeople.find(p=>p.name==='김민수').total,0);
assert.equal((await call('deleteStudents',{name:'김민수'})).data.monthlyPeople.length,0);
for(const room of [roomA.data.id,roomB.data.id]){const c=JSON.parse(globalThis.__quizTestEnv.DB.rows.get(room).data);assert.equal(Object.keys(c.students).length,0);assert(c.history.every(h=>Object.keys(h.scores).length===0));}
const oldTokenState=await GET(new Request('https://quiz.test/api/classroom?id='+id,{headers:{'x-student-token':fresh.data.token}}));assert.equal((await oldTokenState.json()).me,null);
const rejoined=await call('join',{name:'김민수'},'',false);assert.equal(rejoined.status,200);assert.equal(rejoined.data.me.confirmed,false);await call('confirm',{},rejoined.data.token,false);
assert.equal((await call('resetScores',{all:true})).status,200);
assert.equal((await call('deleteStudents',{all:true})).data.people.length,0);
assert.equal(JSON.parse(globalThis.__quizTestEnv.DB.rows.get(roomA.data.id).data).history.length,0);
// Korea calendar month boundary, legacy dates, name normalization, speed award eligibility.
const fixture={students:{1:{id:1,name:'학생 하나',confirmed:true}},history:[{date:'2026-10-31 23:59:59',scores:{1:{score:500}}},{date:'2026-11-01 00:00:00',scores:{1:{score:1000}}}]};
assert.equal(monthKey(Date.parse('2026-10-31T15:00:00Z')),'2026-11');
assert.equal(monthlySummary([fixture],{},Date.parse('2026-10-31T15:00:00Z')).people[0].total,1000);
assert.equal(monthlySummary([fixture],{},Date.parse('2026-11-30T15:00:00Z')).people[0].total,0);
const extra={students:{2:{id:2,name:'학생하나',confirmed:true}},history:[{date:'2026-11-02 09:00:00',scores:{2:{score:2000}}}]};assert.equal(monthlySummary([fixture,extra],{},Date.parse('2026-11-04T00:00:00Z')).people[0].total,3000);
const {speedKings}=await import(raceUrl);assert.deepEqual(speedKings([{id:1},{id:2},{id:3}],{1:{answered:3,right:3,elapsedMs:6000},2:{answered:3,right:1,elapsedMs:3000},3:{answered:2,elapsedMs:1000}},3).map(p=>p.id),[2,1]);
console.log('PASS: cross-room same-name monthly totals, Korea month rollover, legacy records, owner isolation, individual/all resets, individual/all deletion, token revocation, rejoin, separate speed award; existing 30-player/PIN/image/mode tests');

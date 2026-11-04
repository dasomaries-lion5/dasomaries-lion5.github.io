// Behavioral tests for the server route. D1's revision lease is emulated in memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
class MemoryD1 {
 rows=new Map();
 prepare(sql){
  const db=this;
  return {bind(...args){return {
   async first(){return structuredClone(db.rows.get(args[0])||null);},
   async all(){return {results:[...db.rows.values()].filter(r=>r.owner===args[0])};},
   async run(){
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
const raw=fs.readFileSync('app/api/classroom/route.ts','utf8').replace(/import \{env\} from 'cloudflare:workers';/, 'const env=globalThis.__quizTestEnv;').replace("'../../../lib/race'",JSON.stringify(raceUrl));
const code=ts.transpile(raw,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
let id;async function call(action,extra={},token='',host=true){const response=await POST(new Request('https://quiz.test/api/classroom',{method:'POST',headers:{origin:'https://quiz.test','content-type':'application/json',...(host?{'oai-authenticated-user-id':'teacher'}:{}),'x-student-token':token},body:JSON.stringify({id,action,...extra})}));return {status:response.status,data:await response.json()}}
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
console.log('PASS: mixed and initial-only generation, Korean initials, initial-only server validation, mode persistence and round snapshot; existing 30-player race and score tests');

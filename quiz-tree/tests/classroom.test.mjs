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
const raw=fs.readFileSync('app/api/classroom/route.ts','utf8').replace(/import \{env\} from 'cloudflare:workers';/, 'const env=globalThis.__quizTestEnv;');
const code=ts.transpile(raw,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
let id;async function call(action,extra={},token='',host=true){const response=await POST(new Request('https://quiz.test/api/classroom',{method:'POST',headers:{origin:'https://quiz.test','content-type':'application/json',...(host?{'oai-authenticated-user-id':'teacher'}:{}),'x-student-token':token},body:JSON.stringify({id,action,...extra})}));return {status:response.status,data:await response.json()}}
const noLogin=await call('create',{},'',false);assert.equal(noLogin.status,401);
const created=await call('create');assert.equal(created.status,200);id=created.data.id;
const questions=[{type:'주관식',prompt:'인공지능의 영문 약자는?',answer:'AI',options:[],explanation:'Artificial Intelligence'}];
assert.equal((await call('save',{questions},'',false)).status,403);
assert.equal((await call('save',{questions})).status,200);
assert.equal((await call('start',{seconds:30})).status,200);
const joined=await Promise.all(Array.from({length:11},(_,i)=>call('join',{name:'학생'+(i+1)},'',false)));
assert(joined.every(x=>x.status===200));assert.equal(new Set(joined.map(x=>x.data.me.id)).size,11);
const confirmations=await Promise.all(joined.map(s=>call('confirm',{},s.data.token,false)));
assert.equal(confirmations.filter(x=>x.status===200).length,10);assert.equal(confirmations.filter(x=>x.status===400).length,1);
const student=joined[0];const sid=student.data.me.id,token=student.data.token;
const again=await call('join',{name:'학생1'},'',false);assert.equal(again.data.me.id,sid);assert.equal(again.data.me.confirmed,true);
const started=await call('next');assert.equal(started.data.round.phase,'question');
const state=await GET(new Request('https://quiz.test/api/classroom?id='+id,{headers:{'x-student-token':token}}));const safe=await state.json();assert.equal(safe.quiz,undefined);assert.equal(safe.round.question.answer,undefined);assert(!JSON.stringify(safe).includes('tokens'));
const submissions=await Promise.all(joined.slice(0,10).map(s=>call('answer',{roundId:started.data.round.id,index:0,answer:' ai '},s.data.token,false)));
assert(submissions.every(x=>x.status===200));
assert.equal((await call('answer',{roundId:started.data.round.id,index:0,answer:'AI'},token,false)).status,400);
assert.equal((await call('next',{},token,false)).status,403);
await call('next');const finished=await call('next');assert.equal(finished.data.round.phase,'finished');assert.equal(finished.data.history.length,1);assert.equal(finished.data.people.find(p=>p.id===sid).total,1000);
await call('start',{seconds:15});await call('confirm',{},token,false);const r2=await call('next');await call('answer',{roundId:r2.data.round.id,index:0,answer:'AI'},token,false);const f2=await call('finish');assert.equal(f2.data.history.length,2);assert.equal(f2.data.people.find(p=>p.id===sid).total,2000);
assert.equal((await call('finish')).status,400);
const row=globalThis.__quizTestEnv.DB.rows.get(id);let c=JSON.parse(row.data);c.round.phase='question';c.round.deadline=Date.now()-100;c.round.answers={};row.data=JSON.stringify(c);
assert.equal((await call('answer',{roundId:c.round.id,index:0,answer:'AI'},token,false)).status,400);
const badOrigin=await POST(new Request('https://quiz.test/api/classroom',{method:'POST',headers:{origin:'https://other.test'},body:'{}'}));assert.equal(badOrigin.status,403);
console.log('PASS: owner authorization, 11 concurrent registrations, unique IDs, 10-player limit, same-name rejoin, hidden answers, 10 concurrent answers, duplicate/late rejection, two-round cumulative history, origin check');

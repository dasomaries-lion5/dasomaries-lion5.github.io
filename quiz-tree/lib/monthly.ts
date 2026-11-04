export const nameKey=(s:any)=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko-KR');
export const monthKey=(at=Date.now())=>new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,7);
export function recordTime(h:any){if(h.at)return h.at;return Date.parse(String(h.date||'').replace(' ','T')+'+09:00')||0;}
export function deletedAt(state:any,name:string){return Math.max(state?.allDeletedAt||0,state?.deleted?.[nameKey(name)]||0)}
export function visibleStudent(s:any,state:any){return !deletedAt(state,s.name)||(s.createdAt||0)>deletedAt(state,s.name)}
export function monthlySummary(rooms:any[],state:any={},at=Date.now()){
 const month=monthKey(at),map=new Map<string,any>();
 for(const c of rooms){
  for(const s of Object.values(c.students) as any[]){if(!s.confirmed||!visibleStudent(s,state))continue;const key=nameKey(s.name);if(!map.has(key))map.set(key,{key,name:s.name,total:0,games:0});}
  for(const h of c.history||[]){const time=recordTime(h);if(monthKey(time)!==month)continue;
   for(const [id,score] of Object.entries(h.scores||{}) as any){const name=h.names?.[id]||c.students[id]?.name;if(!name)continue;const key=nameKey(name);const cutoff=Math.max(state.allResetAt||0,state.resets?.[key]||0,deletedAt(state,name));if(time<=cutoff)continue;
    if(!map.has(key))map.set(key,{key,name,total:0,games:0});const p=map.get(key);p.total+=score.score||0;p.games++;
   }
  }
 }
 return {month,people:[...map.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'ko'))};
}

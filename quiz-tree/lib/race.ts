export type RaceScore = {score:number;right:number;answered:number;elapsedMs:number|null};
// Correct answers decide distance; elapsed server time breaks ties.
export function raceScores(round:any, now=Date.now()):Record<string,RaceScore>{
 const result:Record<string,RaceScore>={};
 for(const id of round.participants){
  const answers=round.answers[id]||{};let score=0,right=0,answered=0;
  for(const a of Object.values(answers) as any[]){score+=a.points;right+=a.correct?1:0;answered++;}
  let elapsedMs:number|null=round.questionStarts?.length?0:null;
  if(elapsedMs!==null){
   for(let i=0;i<round.questionStarts.length;i++){
    const start=round.questionStarts[i];if(typeof start!=='number')continue;
    const a=answers[i],end=round.questionEnds?.[i]??round.finishedAt??now;
    elapsedMs+=a?Math.min(round.seconds*1000,Math.max(0,a.elapsedMs??a.at-start)):Math.min(round.seconds*1000,Math.max(0,end-start));
   }
  }
  result[id]={score,right,answered,elapsedMs};
 }
 return result;
}
export function compareRace(a:any,b:any){return (b?.right||0)-(a?.right||0)||((a?.elapsedMs??Number.MAX_SAFE_INTEGER)-(b?.elapsedMs??Number.MAX_SAFE_INTEGER));}
export function raceRank(people:any[],scores:any,id:number){const mine=scores[id];return 1+people.filter(p=>compareRace(scores[p.id],mine)<0).length;}
export function formatTime(ms:number|null|undefined){return ms==null?'—':(ms/1000).toFixed(2)+'초';}
export function raceDistance(score:any,count:number,seconds:number){
 const right=score?.right||0;
 const speed=right&&score?.elapsedMs!=null?Math.max(0,Math.min(1,1-score.elapsedMs/(Math.max(1,count)*seconds*1000))):0;
 return Math.min(100,(right+speed*.7)/(Math.max(1,count)+.7)*100);
}

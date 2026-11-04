'use client';
import {useState,useEffect} from 'react';
import {Flag,Maximize2,Minimize2,Trophy} from 'lucide-react';
import {compareRace,formatTime,raceRank,raceDistance} from '../lib/race';
const animals=['🐰','🐼','🦊','🐯','🐸','🐨','🐹','🐻','🐱','🐶'];
const colors=['#d1734e','#347b69','#d09a32','#6479ac','#9b70a2','#4b94a4'];
export default function RaceTrack({people,scores,count,finished=false,phase='lobby',demo=false,seconds=30}:any){
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{if(!expanded)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)};window.addEventListener('keydown',close);return()=>{document.body.style.overflow=before;window.removeEventListener('keydown',close)}},[expanded]);
 // Stable numbered lanes keep each child easy to follow while the rank changes.
 const lanes=[...people].sort((a,b)=>a.id-b.id);
 const ranked=[...people].sort((a,b)=>compareRace(scores[a.id],scores[b.id]));
 const leaders=ranked.filter(p=>(scores[p.id]?.answered||0)>0).slice(0,3);
 return <div className={'race-view '+(expanded?'race-expanded':'')+' '+(demo?'race-demo':'')}>
  <div className="race-top"><div><span className="race-eyebrow">QUIZ SPRINT</span><h3>{finished?'결승 결과':phase==='lobby'&&!demo?'우리 반 출발선':'우리 반 퀴즈 달리기'}</h3></div><button className="icon-btn" aria-label={expanded?'달리기 전체 보기 닫기':'달리기 전체 보기'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button></div>
  {leaders.length>0&&<div className="podium-strip">{leaders.map((p,i)=><span key={p.id}><b>{['🥇','🥈','🥉'][raceRank(people,scores,p.id)-1]}</b>{p.name}<small>{formatTime(scores[p.id]?.elapsedMs)}</small></span>)}</div>}
  <div className="track-scroll" tabIndex={0} aria-label="전체 학생 달리기 트랙"><div className="track-board">
   <div className="track-scale"><span>START</span><span>정확하고 빠르게!</span><span>FINISH <Flag size={12}/></span></div>
   <div className="track-lanes" style={{'--lane-count':Math.max(3,lanes.length),'--lane-height':lanes.length>20&&!expanded?'34px':lanes.length>8&&!expanded?'46px':'70px'} as any}>
    {(lanes.length?lanes:[{id:1,name:'친구들을 기다려요'},{id:2,name:'링크로 함께 참여해요'},{id:3,name:'출발 준비!'}]).map((p:any,i:number)=>{
     const s=scores[p.id]||{},right=s.right||0;
     const distance=lanes.length?raceDistance(s,count,seconds):0;
     const rank=raceRank(people,scores,p.id),running=phase==='question'&&!finished;
     return <div className="track-lane" key={p.id} style={{'--runner-color':colors[i%colors.length]} as any}>
      <div className="lane-person"><span className="lane-number">{p.id}</span><span title={p.name}>{p.name}<small>{lanes.length?right+'/'+count+' 정답':'참여 대기'}</small></span></div>
      <div className="lane-course"><div className="lane-distance" style={{width:distance+'%'}}/><div className={'runner '+(running?'is-running':'')+(finished&&rank===1?' is-winner':'')} style={{left:distance+'%'}}><span className="runner-avatar">{animals[(p.id-1)%animals.length]}<i className="runner-leg leg-a"/><i className="runner-leg leg-b"/></span>{finished&&rank===1&&<span className="winner-flag">🏆</span>}<span className="runner-dust">· ·</span></div><div className="finish-line"/></div>
      <div className="lane-result"><b>{lanes.length?rank+'위':'—'}</b><span>{lanes.length?formatTime(s.elapsedMs):'대기'}</span></div>
     </div>;
    })}
   </div>
  </div></div>
  <div className="race-legend"><span>🏁 정답 수 우선 · 같으면 풀이 시간이 짧은 순</span><span>{people.length}명 함께 달리는 중</span></div>
 </div>;
}

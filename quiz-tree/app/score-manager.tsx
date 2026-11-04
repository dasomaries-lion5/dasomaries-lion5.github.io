'use client';
import LionAvatar from './lion-avatar';
import {formatTime} from '../lib/race';
export default function ScoreManager({data,act,busy,onExport}:any){
 const people=data.monthlyPeople||[];
 async function manage(action:string,name?:string){
  const target=name?name+' 학생':'전체 학생';
  const message=action==='resetScores'?target+'의 이번 달 누적점수를 0점으로 리셋할까요? 같은 선생님의 모든 수업에 적용됩니다. 경기 기록은 보존됩니다.':target+'의 등록과 점수 기록을 삭제할까요? 같은 선생님의 모든 수업에 적용되며 삭제한 기록은 되돌릴 수 없습니다.';
  if(confirm(message))await act(action,{name,all:!name});
 }
 return <section className="card score-manager"><div className="section-heading"><div><div className="step">MONTHLY LEAGUE</div><h2>{data.month} 월간 누적 리그</h2></div><button className="secondary" onClick={onExport}>경기 CSV 저장</button></div><p className="monthly-rule">같은 선생님의 모든 수업에서 <b>같은 이름의 점수가 합산</b>됩니다. 한국 시간 매월 1일 00시에 새 월간 리그가 시작되고 이전 기록은 보관됩니다.</p><div className="management-actions"><button disabled={busy} className="secondary" onClick={()=>manage('resetScores')}>전체 점수 리셋</button><button disabled={busy} className="danger-button" onClick={()=>manage('deleteStudents')}>학생 일괄 삭제</button></div><div className="score-table-wrap"><table className="score-table"><thead><tr><th>순위</th><th>학생</th><th>월간 점수</th><th>경기 수</th><th>학생 관리</th></tr></thead><tbody>{people.map((p:any,i:number)=><tr key={p.key}><td>{i+1}</td><td><LionAvatar number={i+1}/><b>{p.name}</b></td><td><strong>{p.total.toLocaleString()}점</strong></td><td>{p.games}회</td><td><div className="row-actions"><button disabled={busy} className="secondary" onClick={()=>manage('resetScores',p.name)}>점수 리셋</button><button disabled={busy} className="danger-button" onClick={()=>manage('deleteStudents',p.name)}>학생 삭제</button></div></td></tr>)}</tbody></table></div>{!people.length&&<p className="help">아직 등록된 학생이 없습니다.</p>}<h3>이 수업의 날짜별 경기 기록</h3>{data.history.length?data.history.slice().reverse().map((h:any)=><details key={h.id}><summary>{h.date} · {h.title} · {Object.keys(h.scores).length}명</summary>{Object.entries(h.scores).map(([sid,s]:any)=><p key={sid}>{h.names?.[sid]||data.people.find((p:any)=>p.id===+sid)?.name} · {s.right}/{s.total}문제 · {s.score}점 · {formatTime(s.elapsedMs)}</p>)}</details>):<p className="help">완료된 경기 기록이 여기에 표시됩니다.</p>}</section>
}

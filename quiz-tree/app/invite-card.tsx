'use client';
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
export function InviteCard({id,pin,onCreatePin,disabled}:any){
 const [qr,setQr]=useState(''),[link,setLink]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const url=location.origin+'/?room='+encodeURIComponent(id);setLink(url);let alive=true;QRCode.toDataURL(url,{width:300,margin:3,errorCorrectionLevel:'M',color:{dark:'#253d32',light:'#ffffff'}}).then(v=>{if(alive)setQr(v)}).catch(()=>{if(alive)setError('QR 생성에 실패했습니다. 아래 링크를 이용해 주세요.')});return()=>{alive=false}},[id]);
 return <section className="card invite-card"><div className="step">JOIN OUR CLASS</div><h3>학생 입장 안내</h3><p className="help">QR 스캔 또는 첫 화면에서 PIN 입력</p>{pin?<div className="room-pin" aria-label={'입장 PIN '+pin}>{pin}</div>:<div><p className="help">대기실을 열면 PIN이 표시됩니다.</p><button type="button" className="secondary" disabled={disabled} onClick={onCreatePin}>입장 PIN 만들기</button></div>}{qr&&<img className="invite-qr" src={qr} alt="학생 입장 QR코드" width={220} height={220}/>}<a className="invite-link" href={link}>{link}</a>{error&&<p role="alert">{error}</p>}<p className="help">대기실에서는 기다려 주세요.<br/>선생님이 <b>첫 문제 시작</b>을 눌러야 문제가 나와요.</p></section>
}
export function PinEntry(){
 const [pin,setPin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function join(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const res=await fetch('/api/classroom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'lookupPin',pin})});const d:any=await res.json();if(!res.ok)throw Error(d.error);location.href='/?room='+encodeURIComponent(d.id)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <form className="pin-entry" onSubmit={join}><label>수업 PIN 번호<input inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} placeholder="6자리 PIN" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/></label><button disabled={busy||pin.length!==6} className="wide">{busy?'입장 중…':'PIN으로 입장하기'}</button>{error&&<p role="alert" className="pin-error">{error}</p>}<p className="help">초대 링크나 QR코드로도 바로 입장할 수 있어요.</p></form>
}

'use client';
import {useEffect,useState} from 'react';
async function imageFile(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPG, PNG, WEBP 이미지를 선택해 주세요.');
 if(file.size>20*1024*1024)throw Error('원본 이미지는 20MB 이하로 선택해 주세요.');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지를 읽지 못했습니다.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('이미지 변환 실패')),'image/jpeg',.85));return new File([blob],'question.jpg',{type:'image/jpeg'});
}
export function QuestionImage({id,image,onChange}:any){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function upload(file:File){setBusy(true);setError('');try{const form=new FormData();form.append('room',id);form.append('image',await imageFile(file));const res=await fetch('/api/image',{method:'POST',body:form});const d:any=await res.json();if(!res.ok)throw Error(d.error);onChange(d.image)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <div className="question-image-editor">{image&&<img className="question-image" src={image} alt="문제 첨부 이미지 미리보기"/>}<label>문제에 그림 첨부<input aria-label="문제에 그림 첨부" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0]);e.target.value=''}}/></label>{busy&&<p className="help">이미지 첨부 중…</p>}{image&&<button type="button" className="text-btn" onClick={()=>onChange(null)}>그림 첨부 해제</button>}{error&&<p className="pin-error" role="alert">{error}</p>}</div>
}
export function ImageMaterial({onText,onBusy,disabled}:any){
 const [files,setFiles]=useState<File[]>([]),[previews,setPreviews]=useState<string[]>([]),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const urls=files.map(f=>URL.createObjectURL(f));setPreviews(urls);return()=>urls.forEach(u=>URL.revokeObjectURL(u))},[files]);
 async function recognize(){setBusy(true);onBusy(true);setStatus('한글·영어 글자 인식 준비 중…');let worker:any;try{const {createWorker}=await import('tesseract.js');worker=await createWorker(['kor','eng'],1,{logger:(m:any)=>{if(m.status==='recognizing text')setStatus('글자 읽는 중 '+Math.round(m.progress*100)+'%')}});let text='';for(let i=0;i<files.length;i++){setStatus((i+1)+' / '+files.length+'번째 이미지 읽는 중…');const result=await worker.recognize(await imageFile(files[i]));text+=result.data.text+'\n';}if(text.trim().length<5)throw Error('글자를 충분히 찾지 못했습니다. 더 선명한 사진을 선택하거나 내용을 직접 입력해 주세요.');onText(text.trim());setStatus('글자 읽기 완료! 아래 내용과 띄어쓰기를 확인한 후 문제를 만들어 주세요.')}catch(e:any){setStatus('글자 인식: '+e.message)}finally{await worker?.terminate();setBusy(false);onBusy(false)}}
 return <section className="image-material"><label>이미지 자료 선택 (사진·스크린샷)<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={disabled||busy} onChange={e=>{setFiles(Array.from(e.target.files||[]).slice(0,10));setStatus('')}}/></label>{files.length>0&&<><div className="material-previews">{previews.map((url,i)=><img key={url} src={url} alt={'자료 이미지 '+(i+1)}/>)}</div><button type="button" className="secondary wide" disabled={disabled||busy} onClick={recognize}>이미지 {files.length}장의 글자 읽기</button></>}<p className="help">한 번에 10장까지 · 한글/영어 인식 · 첫 사용 시 인식 자료를 내려받아 시간이 걸릴 수 있어요. 사진은 이 브라우저에서 읽습니다.</p>{status&&<p className="ocr-status" role="status">{status}</p>}</section>
}

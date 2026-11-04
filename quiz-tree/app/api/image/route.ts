import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const error=(message:string,status:number)=>Response.json({error:message},{status});
export async function POST(req:Request){
 try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return error('요청 출처를 확인해 주세요.',403);
  const owner=req.headers.get('oai-authenticated-user-id');if(!owner)return error('선생님 로그인 후 이미지를 첨부할 수 있습니다.',401);
  const form=await req.formData();const room=String(form.get('room')||'');const file=form.get('image');
  const row=await (env as any).DB.prepare('SELECT * FROM classrooms WHERE id=?').bind(room).first();
  if(!row||row.owner!==owner)return error('이 수업의 선생님만 첨부할 수 있습니다.',403);
  if(!(file instanceof File)||file.size<12||file.size>2*1024*1024)return error('이미지는 2MB 이하로 첨부해 주세요.',400);
  const bytes=new Uint8Array(await file.arrayBuffer());let ext='',mime='';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){ext='jpg';mime='image/jpeg'}
  else if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)){ext='png';mime='image/png'}
  else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'){ext='webp';mime='image/webp'}
  else return error('JPG, PNG, WEBP 이미지를 사용해 주세요.',400);
  const key=crypto.randomUUID()+'.'+ext;
  await (env as any).BUCKET.put('questions/'+room+'/'+key,bytes,{httpMetadata:{contentType:mime}});
  return Response.json({image:'/api/image?room='+encodeURIComponent(room)+'&key='+key});
 }catch{return error('이미지 첨부에 실패했습니다. 잠시 뒤 다시 시도해 주세요.',500)}
}
export async function GET(req:Request){
 try{
  const u=new URL(req.url),room=u.searchParams.get('room')||'',key=u.searchParams.get('key')||'';
  if(!/^[a-zA-Z0-9-]+$/.test(room)||!/^[-a-f0-9]+\.(jpg|png|webp)$/.test(key))return error('이미지를 찾을 수 없습니다.',404);
  const image=await (env as any).BUCKET.get('questions/'+room+'/'+key);if(!image)return error('이미지를 찾을 수 없습니다.',404);
  return new Response(image.body,{headers:{'Content-Type':image.httpMetadata?.contentType||'image/jpeg','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
 }catch{return error('이미지를 불러오지 못했습니다.',500)}
}

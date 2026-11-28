const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const error=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const now=()=>Math.floor(Date.now()/1000);
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const gameId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,149}$/.test(value)?value:null;
const field=(value,max,min=0)=>{
  if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)error('Comprueba la longitud de los campos.');
  return value.trim();
};
const configFields=['version','model','launcher','resolution','quality','fps','tdp','vram','scaling','frameGeneration','power','driver','stability','issues','notes'];
const reasons=['spam','insultos','acoso','ilegal','datos personales','enlaces peligrosos','fuera de temática'];
const statuses=['public','pending','hidden','deleted'];
const limit=20;

const photoLimit=150000;
function imageBytes(value){
  if(typeof value!=='string'||value.length>200000||value.length<44||!(/^[A-Za-z0-9+/]+={0,2}$/).test(value)||value.length%4!==0)error('Imagen inválida o demasiado grande.');
  let bytes;
  try{bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{error('Imagen inválida.');}
  if(bytes.length>photoLimit||bytes.length<32)error('Imagen inválida o demasiado grande.');
  const view=new DataView(bytes.buffer);
  const tag=offset=>String.fromCharCode(...bytes.slice(offset,offset+4));
  const size=view.getUint32(16,true);
  if(tag(0)!=='RIFF'||tag(8)!=='WEBP'||view.getUint32(4,true)!==bytes.length-8||20+size+(size%2)!==bytes.length)error('Solo se admiten imágenes WebP sin metadatos.');
  let width,height;
  if(tag(12)==='VP8 '&&size>=10&&(bytes[20]&1)===0&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){
    width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;
  }else if(tag(12)==='VP8L'&&size>=5&&bytes[20]===47){
    const bits=view.getUint32(21,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;
    if(bits>>>29)error('Imagen inválida.');
  }else error('Solo se admiten imágenes estáticas WebP sin metadatos.');
  if(!width||!height||width>1600||height>1600)error('La imagen supera la resolución permitida.');
  return bytes;
}
function photosOf(data,max){
  if(data.photos===undefined)return undefined;
  if(!Array.isArray(data.photos)||data.photos.length>max)error('Demasiadas imágenes.');
  data.photos.forEach(imageBytes);
  return JSON.stringify(data.photos);
}


async function body(request,maxBytes=24576){
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')error('Formato no admitido.',415);
  const reader=request.body?.getReader();
  if(!reader)error('Faltan datos.');
  const decoder=new TextDecoder();
  let size=0,value='';
  for(;;){
    const chunk=await reader.read();
    if(chunk.done)break;
    size+=chunk.value.byteLength;
    if(size>maxBytes){await reader.cancel();error('Solicitud demasiado grande.',413);}
    value+=decoder.decode(chunk.value,{stream:true});
  }
  try{
    const parsed=JSON.parse(value+decoder.decode());
    if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')error('Datos no válidos.');
    return parsed;
  }catch{error('Datos no válidos.');}
}

async function verifyTurnstile(env,request,response){
  if(!env.TURNSTILE_SECRET||!env.TURNSTILE_SITE_KEY)error('La participación aún no está habilitada.',503);
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:field(response,2048,1)}),
    signal:AbortSignal.timeout(5000)
  });
  const verdict=await result.json();
  if(!verdict.success||verdict.hostname!==new URL(request.url).hostname||verdict.action!=='community_session')
    error('Repite la verificación de seguridad.',403);
}

async function admin(request,env){
  if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<32)error('Administración deshabilitada.',503);
  const authorization=request.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer ')||authorization.length>512)error('Acceso reservado.',401);
  const [expected,actual]=await Promise.all([digest(env.ADMIN_TOKEN),digest(authorization.slice(7))]);
  let mismatch=0;
  for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^actual.charCodeAt(i);
  if(mismatch)error('Acceso reservado.',401);
}

export async function onRequest({request,env}){
  try{return await route(request,env);}
  catch(e){
    if(e.status)return json({error:e.message},e.status);
    if(/friend_unavailable/.test(String(e)))return json({error:'Esta relación no está disponible.'},409);
    if(/chat_full/.test(String(e)))return json({error:'Este chat ha alcanzado su límite de mensajes activos. Inténtalo más adelante.'},429);
    if(/photo_budget_exceeded/.test(String(e)))return json({error:'Se ha alcanzado el límite de almacenamiento de imágenes. Puedes publicar sin fotos.'},507);
    if(/UNIQUE constraint/i.test(String(e)))return json({error:'Ese nombre o registro ya está reservado. Elige otro o actualiza la página.'},409);
    return json({error:'Servicio temporalmente no disponible. Inténtalo más tarde.'},503);
  }
}

async function route(request,env){
  const url=new URL(request.url), path=url.pathname.slice(5).split('/'), query=url.searchParams;
  const [resource,id,action]=path, method=request.method;
  if(path.length>3||action&&resource==='admin')error('Ruta no encontrada.',404);
  const labServer=resource==='lab-link'&&!action&&method==='POST'&&!request.headers.get('Origin')&&['redeem','state','favorite','merge','logout'].includes(id);
  if(method!=='GET'&&(method!=='POST'||(!labServer&&request.headers.get('Origin')!==url.origin)))error('Origen o método no autorizado.',403);
  if(!env.DB)error('La base de datos de la comunidad aún no está configurada.',503);
  const db=env.DB;
  const sql=(s,...args)=>db.prepare(s).bind(...args);
  const first=(s,...args)=>sql(s,...args).first();
  const all=async(s,...args)=>(await sql(s,...args).all()).results;
  const run=(s,...args)=>sql(s,...args).run();
  const timestamp=now();
  const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-ally_session=([a-f0-9]{64})(?=;|$)/)?.[1];
  const credential=cookie?await digest(cookie):null;
  const device=credential?await first('SELECT owner,expires FROM profile_devices WHERE id=?',credential):null;
  const owner=device?(device.expires>timestamp?device.owner:null):credential;
  const who=owner?await first('SELECT s.id,s.blocked_until,s.expires,p.username,p.created,p.role FROM sessions s LEFT JOIN profiles p ON p.owner=s.id WHERE s.id=? AND (?=1 OR (s.expires>? AND p.owner IS NULL))',owner,device?1:0,timestamp):null;
  const sessionCookie=key=>'__Host-ally_session='+key+'; Path=/; Max-Age=15552000; Secure; HttpOnly; SameSite=Lax';
  const publicProfile=who=>who?.username?{username:who.username,created:who.created,role:who.role}:null;
  const presencePreference=async()=>who?.username?(await first('SELECT enabled FROM presence_preferences WHERE owner=?',owner))?.enabled??null:null;
  const throttle=async(key,max,window)=>{
    const expires=(Math.floor(timestamp/window)+1)*window;
    const row=await first('INSERT INTO rate VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits',key+':'+expires,expires,max);
    if(!row)error('Has alcanzado el límite. Inténtalo más tarde.',429);
  };
  if(resource==='lab-link'&&method==='POST'&&!action){
    const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
    const data=await body(request);
    if(id==='authorize'||id==='revoke'){
      if(!who?.username||who.username==='Ally'||!device||device.expires<=timestamp||who.blocked_until>timestamp)error('Accede a tu perfil.',401);
      await throttle('lab-consent:'+owner,12,3600);
      if(id==='revoke'){
        await db.batch([sql('DELETE FROM lab_grants WHERE owner=?',owner),sql('DELETE FROM lab_links WHERE owner=?',owner)]);
        return json({ok:true});
      }
      if(!hex(data.state))error('Solicitud de conexión no válida.');
      const code=token();
      await db.batch([sql('DELETE FROM lab_grants WHERE owner=? AND (expires<=? OR device=?)',owner,timestamp,credential),sql('INSERT INTO lab_grants(id,owner,device,state,expires) VALUES(?,?,?,?,?)',await digest(code),owner,credential,await digest(data.state),timestamp+180)]);
      return json({code,expires:timestamp+180});
    }
    if(!labServer)error('Ruta no disponible.',403);
    const bearer=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!bearer)error('Conexión no válida.',401);
    const hashed=await digest(bearer);
    if(id==='redeem'){
      if(!hex(data.state))error('Solicitud de conexión no válida.');
      const grant=await first('DELETE FROM lab_grants WHERE id=? AND state=? AND expires>? RETURNING owner,device',hashed,await digest(data.state),timestamp);
      if(!grant)error('La autorización ha caducado o ya se utilizó.',401);
      const profile=await first("SELECT p.username,d.expires FROM profiles p JOIN profile_devices d ON d.owner=p.owner JOIN sessions s ON s.id=p.owner WHERE p.owner=? AND d.id=? AND d.expires>? AND s.blocked_until<=? AND p.username<>'Ally'",grant.owner,grant.device,timestamp,timestamp);
      if(!profile)error('La sesión de la comunidad ya no está disponible.',401);
      await run('DELETE FROM lab_links WHERE owner=? AND expires<=?',grant.owner,timestamp);
      if((await first('SELECT count(*) AS n FROM lab_links WHERE owner=?',grant.owner)).n>=20)error('Desconecta sesiones de Ally Lab desde tu perfil.',429);
      const session=token(),expires=Math.min(profile.expires,timestamp+2592000);
      await run('INSERT INTO lab_links(id,owner,device,expires) VALUES(?,?,?,?)',await digest(session),grant.owner,grant.device,expires);
      return json({token:session,expires});
    }
    const linked=await first("SELECT l.owner,p.username,l.expires FROM lab_links l JOIN profiles p ON p.owner=l.owner JOIN profile_devices d ON d.id=l.device AND d.owner=l.owner JOIN sessions s ON s.id=l.owner WHERE l.id=? AND l.expires>? AND d.expires>? AND s.blocked_until<=? AND p.username<>'Ally'",hashed,timestamp,timestamp,timestamp);
    if(!linked)error('La conexión con Ally Lab ha caducado.',401);
    if(id==='logout'){await run('DELETE FROM lab_links WHERE id=?',hashed);return json({ok:true});}
    if(id==='favorite'||id==='merge'){
      await throttle('lab-favorites:'+linked.owner,120,600);
      if(id==='favorite'){
        if(!gameId(data.game)||typeof data.enabled!=='boolean')error('Favorito no válido.');
        if(data.enabled){
          await run("INSERT OR IGNORE INTO lab_favorites(owner,game,created) SELECT ?,?,? WHERE (SELECT count(*) FROM lab_favorites WHERE owner=?)<500",linked.owner,data.game,timestamp,linked.owner);
          if(!await first('SELECT 1 AS yes FROM lab_favorites WHERE owner=? AND game=?',linked.owner,data.game))error('Límite de 500 favoritos.',429);
        }else await run('DELETE FROM lab_favorites WHERE owner=? AND game=?',linked.owner,data.game);
      }else{
        if(!Array.isArray(data.games)||data.games.length>500||data.games.some(v=>!gameId(v)))error('Lista de favoritos no válida.');
        const unique=[...new Set(data.games)];
        await run("INSERT OR IGNORE INTO lab_favorites(owner,game,created) SELECT ?,j.value,? FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM lab_favorites f WHERE f.owner=? AND f.game=j.value) LIMIT max(0,500-(SELECT count(*) FROM lab_favorites WHERE owner=?))",linked.owner,timestamp,JSON.stringify(unique),linked.owner,linked.owner);
      }
    }else if(id!=='state')error('Ruta no disponible.',404);
    const favorites=await all('SELECT game FROM lab_favorites WHERE owner=? ORDER BY game LIMIT 500',linked.owner);
    return json({username:linked.username,favorites:favorites.map(r=>r.game),expires:linked.expires});
  }
  if(resource==='member'&&method==='GET'&&id&&!action){
    if(!/^[A-Za-z0-9_]{3,20}$/.test(id))error('Perfil no disponible.',404);
    const member=await first("SELECT p.username,p.role,p.created,d.avatar,d.bio,d.model,d.color,(SELECT count(*) FROM posts t JOIN categories k ON k.id=t.category WHERE t.owner=p.owner AND t.status='public' AND k.hidden=0) AS posts,(SELECT count(*) FROM votes v JOIN posts t ON v.kind='post' AND v.target=t.id JOIN categories k ON k.id=t.category WHERE t.owner=p.owner AND t.status='public' AND k.hidden=0 AND v.value=1 AND v.owner<>p.owner)+(SELECT count(*) FROM votes v JOIN comments c ON v.kind='comment' AND v.target=c.id JOIN posts t ON t.id=c.post JOIN categories k ON k.id=t.category WHERE c.owner=p.owner AND c.status='public' AND t.status='public' AND k.hidden=0 AND v.value=1 AND v.owner<>p.owner) AS helpful FROM profiles p JOIN sessions s ON s.id=p.owner LEFT JOIN profile_public_details d ON d.owner=p.owner WHERE p.username=? COLLATE NOCASE AND s.blocked_until<=?",id,timestamp);
    if(!member)error('Perfil no disponible.',404);
    const rank=member.role==='admin'?'Administrador':member.username==='Ally'?'Asistente Ally':member.helpful>=100?'Leyenda Ally':member.helpful>=40?'Experto Ally':member.helpful>=15?'Veterano':member.helpful>=5?'Explorador':'Recién llegado';
    const recent=await all("SELECT t.id,t.title FROM posts t JOIN categories k ON k.id=t.category JOIN profiles p ON p.owner=t.owner WHERE p.username=? COLLATE NOCASE AND t.status='public' AND k.hidden=0 ORDER BY t.id DESC LIMIT 10",id);
    return json({profile:{...member,rank,avatar:member.avatar||'🎮',bio:member.bio||'',model:member.model||'',color:member.color||'purple'},recent});
  }
  if(resource==='thread-tools'&&positive(id)){
    const post=positive(id);
    const item=await first("SELECT p.id,p.owner,p.closed FROM posts p JOIN categories k ON k.id=p.category WHERE p.id=? AND p.status='public' AND k.hidden=0",post);
    if(!item)error('Publicación no disponible.',404);
    if(method==='GET'&&!action){
      const solution=await first("SELECT c.id,c.body,p.username FROM accepted_solutions a JOIN comments c ON c.id=a.comment AND c.post=a.post LEFT JOIN profiles p ON p.owner=c.owner WHERE a.post=? AND c.status='public'",post);
      const poll=await first('SELECT options FROM thread_polls WHERE post=?',post);
      const following=who?.username?!!await first('SELECT 1 AS yes FROM thread_follows WHERE post=? AND owner=?',post,owner):false;
      let vote=null,counts=[];
      if(poll){
        const grouped=await all('SELECT choice,count(*) AS total FROM thread_poll_votes WHERE post=? GROUP BY choice',post);
        counts=JSON.parse(poll.options).map((_,i)=>Number(grouped.find(r=>r.choice===i)?.total||0));
        if(who?.username)vote=(await first('SELECT choice FROM thread_poll_votes WHERE post=? AND owner=?',post,owner))?.choice??null;
      }
      return json({solution,poll:poll?{options:JSON.parse(poll.options),counts,vote}:null,following});
    }
    if(method!=='POST'||!who?.username||who.username==='Ally')error('Accede a tu perfil.',401);
    if(who.blocked_until>timestamp)error('Esta sesión está restringida.',403);
    const settings=await first('SELECT * FROM settings WHERE id=1');
    if(!settings||settings.readonly)error('La comunidad está en modo de solo lectura.',403);
    const data=await body(request);
    await throttle('thread-tools:'+owner,30,600);
    if(action==='follow'){
      if(typeof data.enabled!=='boolean')error('Preferencia no válida.');
      if(data.enabled){
        if((await first('SELECT count(*) AS n FROM thread_follows WHERE owner=?',owner)).n>=100&&!await first('SELECT 1 AS yes FROM thread_follows WHERE owner=? AND post=?',owner,post))error('Límite de 100 hilos seguidos.',429);
        if((await first('SELECT count(*) AS n FROM thread_follows WHERE post=?',post)).n>=500&&!await first('SELECT 1 AS yes FROM thread_follows WHERE owner=? AND post=?',owner,post))error('Este hilo ha alcanzado su límite de seguidores.',429);
        await run('INSERT OR IGNORE INTO thread_follows(owner,post) VALUES(?,?)',owner,post);
      }else await run('DELETE FROM thread_follows WHERE owner=? AND post=?',owner,post);
      return json({ok:true});
    }
    if(action==='solution'){
      if(item.owner!==owner)error('Solo el autor del hilo puede marcar una solución.',403);
      if(data.comment===null){await run('DELETE FROM accepted_solutions WHERE post=?',post);return json({ok:true});}
      const comment=positive(data.comment);
      if(!comment||!await first("SELECT id FROM comments WHERE id=? AND post=? AND status='public'",comment,post))error('Comentario no disponible.',404);
      await run('INSERT INTO accepted_solutions(post,comment) VALUES(?,?) ON CONFLICT(post) DO UPDATE SET comment=excluded.comment',post,comment);
      return json({ok:true});
    }
    if(action==='poll'){
      if(item.owner!==owner)error('Solo el autor puede crear una encuesta.',403);
      if(settings.review||item.closed)error('Las encuestas no están disponibles en este hilo.',403);
      if(!Array.isArray(data.options)||data.options.length<2||data.options.length>6)error('Indica de dos a seis opciones.');
      const options=data.options.map(s=>field(s,80,1));
      if(new Set(options.map(s=>s.toLowerCase())).size!==options.length)error('Las opciones deben ser diferentes.');
      if(!await first('INSERT INTO thread_polls(post,options,created) VALUES(?,?,?) ON CONFLICT(post) DO NOTHING RETURNING post',post,JSON.stringify(options),timestamp))error('El hilo ya tiene una encuesta.',409);
      return json({ok:true},201);
    }
    if(action==='vote'){
      if(item.closed)error('El hilo está cerrado.',403);
      const poll=await first('SELECT options FROM thread_polls WHERE post=?',post);
      if(!poll||!Number.isInteger(data.choice)||data.choice<0||data.choice>=JSON.parse(poll.options).length)error('Opción no válida.');
      await run('INSERT INTO thread_poll_votes(post,owner,choice) VALUES(?,?,?) ON CONFLICT(post,owner) DO UPDATE SET choice=excluded.choice',post,owner,data.choice);
      return json({ok:true});
    }
    error('Ruta no encontrada.',404);
  }
  if(resource==='photos'&&method==='GET'){
    const target=positive(action), index=Number(query.get('index')||0);
    if(!['post','comment'].includes(id)||!target||!Number.isInteger(index)||index<0||index>=3)error('Imagen no disponible.',404);
    const isAdmin=!!request.headers.get('Authorization');
    if(isAdmin)await admin(request,env);
    const allowed=id==='post'?
      "SELECT p.photos FROM posts p JOIN categories k ON k.id=p.category WHERE p.id=? AND p.status<>'deleted' AND (?=1 OR (k.hidden=0 AND (p.status='public' OR (p.owner=? AND p.status='pending'))))":
      "SELECT c.photos FROM comments c JOIN posts p ON p.id=c.post JOIN categories k ON k.id=p.category WHERE c.id=? AND c.status<>'deleted' AND p.status<>'deleted' AND (?=1 OR (k.hidden=0 AND p.status='public' AND (c.status='public' OR (c.owner=? AND c.status='pending'))))";
    const row=await first(allowed,target,+isAdmin,who?.id??null);
    const value=row&&JSON.parse(row.photos)[index];
    if(!value)error('Imagen no disponible.',404);
    return new Response(imageBytes(value),{headers:{'Content-Type':'image/webp','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline; filename="imagen.webp"'}});
  }
  if(resource==='admin'){
    await admin(request,env);
    if(method==='GET'){
      const tables=['posts','comments','reports','audit','categories','settings','ally_bot_settings'];
      const fields=table=>table==='ally_bot_settings'?'id,enabled':table==='posts'?'id,owner,category,title,body,game,tags,config,debate,status,closed,pinned,score,replies,hash,created,views,json_array_length(photos) AS photoCount':table==='comments'?'id,post,parent,depth,owner,body,status,score,created,json_array_length(photos) AS photoCount':'*';
      if(id==='export'){
        const table=query.get('table');
        if(![...tables,'sessions','votes','notices'].includes(table))error('Tabla no válida.');
        return json({rows:await all('SELECT rowid AS cursor,'+fields(table)+' FROM '+table+' WHERE rowid>? ORDER BY rowid LIMIT 200',positive(query.get('after'))||0)});
      }
      return json(Object.fromEntries(await Promise.all(tables.map(async table=>[table,await all('SELECT '+fields(table)+' FROM '+table+' ORDER BY id DESC LIMIT 50')]))));
    }
    const data=await body(request), target=positive(data.id);
    let statement,notice;
    if(id==='ally-bot'){
      if(typeof data.enabled!=='boolean')error('Estado no válido.');
      statement=sql('UPDATE ally_bot_settings SET enabled=? WHERE id=1',+data.enabled);
    }else if(id==='settings'){
      statement=sql('UPDATE settings SET readonly=?,stop_posts=?,review=? WHERE id=1',+!!data.readonly,+!!data.stop_posts,+!!data.review);
    }else if(id==='category'){
      if(data.delete){
        if(await first('SELECT id FROM posts WHERE category=? LIMIT 1',target))error('Oculta la categoría o mueve sus publicaciones antes de eliminarla.',409);
        statement=sql('DELETE FROM categories WHERE id=?',target);
      }else{
        const name=field(data.name,70,2), position=positive(data.position)||1;
        statement=target?sql('UPDATE categories SET name=?,position=?,hidden=? WHERE id=?',name,position,+!!data.hidden,target):
          sql('INSERT INTO categories(name,position,hidden) VALUES(?,?,?)',name,position,+!!data.hidden);
      }
    }else if(id==='report'&&target)statement=sql('UPDATE reports SET closed=1 WHERE id=?',target);
    else if(id==='block'&&/^[a-f0-9]{64}$/.test(data.owner||'')){
      if(await first('SELECT 1 AS bot FROM ally_bot_settings WHERE owner=?',data.owner))error('Usa el interruptor de participación de Ally.',409);
      const seconds=Number(data.seconds);
      if(!Number.isInteger(seconds)||seconds<0||seconds>31536000)error('Duración no válida.');
      statement=sql('UPDATE sessions SET blocked_until=? WHERE id=?',data.permanent?253402300799:seconds?timestamp+seconds:0,data.owner);
    }else if(['post','comment'].includes(id)&&target){
      const table=id==='post'?'posts':'comments';
      const record=await first('SELECT * FROM '+table+' WHERE id=?',target);
      if(!record)error('Contenido no encontrado.',404);
      if(data.status==='deleted')statement=sql("UPDATE "+table+" SET status='deleted',body='',photos='[]'"+(id==='post'?",title='[Publicación eliminada]',tags='[]',config=NULL":"")+' WHERE id=?',target);
      else if(statuses.slice(0,3).includes(data.status)&&record.status!=='deleted')
        statement=sql('UPDATE '+table+' SET status=? WHERE id=?',data.status,target);
      else if(id==='post'&&record.status!=='deleted'){
        statement=sql('UPDATE posts SET pinned=?,closed=? WHERE id=?',+!!data.pinned,+!!data.closed,target);
      }else error('Acción no válida.');
      notice=sql('INSERT INTO notices(owner,post,message,created) VALUES(?,?,?,?)',record.owner,id==='post'?target:record.post,'Moderación ha revisado tu contenido.',timestamp);
    }else error('Acción no válida.');
    await db.batch([statement,sql('INSERT INTO audit(action,target,created) VALUES(?,?,?)',id,String(target||data.owner||''),timestamp),...(notice?[notice]:[])]);
    return json({ok:true});
  }
  if(resource==='visits'&&method==='POST'&&!id){
    // Solo se cuentan lecturas reales de la vista de detalle; las listas y
    // las peticiones GET no registran visitas.
    const data=await body(request), post=positive(data.post);
    if(!post)error('Publicación no válida.');
    const exists=await first("SELECT p.views FROM posts p JOIN categories c ON c.id=p.category WHERE p.id=? AND p.status='public' AND c.hidden=0",post);
    if(!exists)error('Publicación no disponible.',404);
    const visitorCookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-ally_visitor=([a-f0-9]{64})(?=;|$)/)?.[1];
    let newVisitor=null, headers={};
    let viewer;
    if(who?.username)viewer='profile:'+who.id;
    else{
      newVisitor=visitorCookie||token();
      viewer='browser:'+await digest(newVisitor);
      if(!visitorCookie)headers={'Set-Cookie':'__Host-ally_visitor='+newVisitor+'; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax'};
    }
    const seen=await first('SELECT 1 AS seen FROM post_views WHERE post=? AND viewer=?',post,viewer);
    if(!seen){
      // La IP solo participa en una cuota temporal de seguridad, nunca en
      // el identificador de visita ni en la tabla post_views.
      const ip=request.headers.get('CF-Connecting-IP');
      if(!ip||!env.RATE_SECRET||env.RATE_SECRET.length<32)error('Contador temporalmente no disponible.',503);
      const hour=Math.floor(timestamp/3600);
      const encoder=new TextEncoder();
      const key=await crypto.subtle.importKey('raw',encoder.encode(env.RATE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const fingerprint=await crypto.subtle.sign('HMAC',key,encoder.encode('view:'+hour+':'+ip));
      const bucket=Array.from(new Uint8Array(fingerprint),v=>v.toString(16).padStart(2,'0')).join('');
      await throttle('visits:'+bucket,300,3600);
      await run('INSERT OR IGNORE INTO post_views(post,viewer,created) VALUES(?,?,?)',post,viewer,timestamp);
      if(Math.random()<0.01)await run('DELETE FROM rate WHERE rowid IN (SELECT rowid FROM rate WHERE expires<? LIMIT 100)',timestamp);
    }
    const current=await first('SELECT views FROM posts WHERE id=?',post);
    return json({views:current.views},200,headers);
  }
  if(resource==='friends'||resource==='chat'){
    if(!who?.username||who.username==='Ally')error('Accede a tu perfil.',401);
    if(who.blocked_until>timestamp)error('Esta sesión está restringida.',403);
    const cutoff=timestamp-2592000;
    async function cleanSocial(){
      await db.batch([sql('DELETE FROM private_messages WHERE id IN (SELECT id FROM private_messages WHERE created<? LIMIT 200)',cutoff),sql('DELETE FROM friend_activity WHERE rowid IN (SELECT rowid FROM friend_activity WHERE last_active<? LIMIT 100)',cutoff),sql('DELETE FROM friend_links WHERE id IN (SELECT id FROM friend_links WHERE accepted=0 AND created<? LIMIT 100)',cutoff),sql('DELETE FROM friend_outcome_notices WHERE id IN (SELECT id FROM friend_outcome_notices WHERE created<? LIMIT 100)',cutoff)]);
    }
    const related=(target)=>first('SELECT id,a,b,requested_by,accepted,created FROM friend_links WHERE a=? AND b=?',...[owner,target].sort());
    const participant=async username=>{
      if(typeof username!=='string'||!/^[A-Za-z0-9_]{3,20}$/.test(username))error('Nombre no válido.');
      const person=await first("SELECT p.owner,p.username,s.blocked_until FROM profiles p JOIN sessions s ON s.id=p.owner WHERE p.username=? COLLATE NOCASE AND p.username<>'Ally' COLLATE NOCASE AND p.owner<>?",username,owner);
      if(!person)error('Usuario no disponible.',404);
      return person;
    };
    if(resource==='friends'){
      if(method==='GET'&&!action){
        if(id==='notifications'){
          const requests=await all("SELECT f.id,p.username,f.created FROM friend_links f JOIN profiles p ON p.owner=f.requested_by WHERE f.accepted=0 AND f.requested_by<>? AND (f.a=? OR f.b=?) AND f.created>=? ORDER BY f.id DESC",owner,owner,owner,cutoff);
          const chats=await all("SELECT f.id,p.username,count(*) AS unread,max(m.created) AS created FROM friend_links f JOIN private_messages m ON m.friendship=f.id JOIN profiles p ON p.owner=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.accepted=1 AND (f.a=? OR f.b=?) AND m.sender<>? AND m.read_at IS NULL AND m.created>=? GROUP BY f.id,p.username ORDER BY created DESC",owner,owner,owner,owner,cutoff);
          const outcomes=await all("SELECT n.id,n.kind,n.request_id AS requestId,p.username,n.created,n.read_at,CASE WHEN f.accepted=1 AND (f.a=? OR f.b=?) THEN f.id ELSE NULL END AS chatId FROM friend_outcome_notices n JOIN profiles p ON p.owner=n.actor LEFT JOIN friend_links f ON f.id=n.request_id WHERE n.owner=? AND n.created>=? ORDER BY n.id DESC LIMIT 50",owner,owner,owner,cutoff);
          const count=await first('SELECT count(*) AS n FROM friend_outcome_notices WHERE owner=? AND read_at IS NULL AND created>=?',owner,cutoff);
          return json({requests,chats,outcomes,unreadOutcomes:Number(count.n)});
        }
        if(id==='summary'){
          const row=await first('SELECT (SELECT count(*) FROM friend_links WHERE accepted=0 AND created>=? AND requested_by<>? AND (a=? OR b=?)) AS requests,(SELECT count(*) FROM private_messages m JOIN friend_links f ON f.id=m.friendship WHERE f.accepted=1 AND (f.a=? OR f.b=?) AND m.sender<>? AND m.read_at IS NULL AND m.created>=?) AS unread',cutoff,owner,owner,owner,owner,owner,owner,cutoff);
          const outcomes=await first('SELECT count(*) AS n FROM friend_outcome_notices WHERE owner=? AND read_at IS NULL AND created>=?',owner,cutoff);
          const normal=await first('SELECT count(*) AS n FROM (SELECT id FROM notices WHERE owner=? AND id>coalesce((SELECT through_id FROM notice_read_cursor WHERE owner=?),0) ORDER BY id DESC LIMIT 99)',owner,owner);
          return json({requests:Number(row.requests),unread:Number(row.unread),outcomes:Number(outcomes.n),notices:Number(normal.n)});
        }
        if(id)error('Ruta no encontrada.',404);
        if(Math.random()<.1)await cleanSocial();
        const rows=await all("SELECT f.id,f.accepted,f.requested_by=? AS outgoing,p.username,CASE WHEN pp.enabled=1 AND s.blocked_until<=? AND ps.expires>? THEN 1 ELSE 0 END AS online,CASE WHEN pp.enabled=1 AND fp.enabled=1 AND s.blocked_until<=? AND fa.last_active>=? THEN fa.last_active ELSE NULL END AS active, (SELECT count(*) FROM private_messages m WHERE m.friendship=f.id AND m.sender<>? AND m.read_at IS NULL AND m.created>=?) AS unread FROM friend_links f JOIN profiles p ON p.owner=CASE WHEN f.a=? THEN f.b ELSE f.a END JOIN sessions s ON s.id=p.owner LEFT JOIN presence_preferences pp ON pp.owner=p.owner LEFT JOIN profile_presence ps ON ps.owner=p.owner LEFT JOIN friend_activity_preferences fp ON fp.owner=p.owner LEFT JOIN friend_activity fa ON fa.owner=p.owner WHERE (f.a=? OR f.b=?) AND (f.accepted=1 OR f.created>=?) ORDER BY f.accepted DESC,online DESC,p.username COLLATE NOCASE",owner,timestamp,timestamp,timestamp,cutoff,owner,cutoff,owner,owner,owner,cutoff);
        const age=seconds=>{const m=Math.max(0,Math.floor(seconds/60));return m<5?'Hace unos minutos':m<60?'Hace '+Math.floor(m/5)*5+' min':m<1440?'Hace '+Math.floor(m/60)+' h':'Hace '+Math.floor(m/1440)+' días';};
        const blocked=await all('SELECT p.username FROM friend_blocks b JOIN profiles p ON p.owner=b.other WHERE b.owner=? ORDER BY p.username',owner);
        const pref=await first('SELECT enabled FROM friend_activity_preferences WHERE owner=?',owner);
        return json({rows:rows.map(r=>({id:r.id,username:r.username,accepted:!!r.accepted,outgoing:!!r.outgoing,online:!!r.accepted&&!!r.online,lastSeen:r.accepted&&!r.online&&r.active!==null?age(timestamp-r.active):null,unread:Number(r.unread)})),blocked:blocked.map(r=>r.username),activitySharing:pref?.enabled===1});
      }
      if(method!=='POST'||action)error('Ruta no encontrada.',404);
      const data=await body(request);
      if(id==='notifications-read'){
        const through=positive(data.through);if(!through)error('Aviso no válido.');
        await run('UPDATE friend_outcome_notices SET read_at=? WHERE owner=? AND id<=? AND read_at IS NULL AND created>=?',timestamp,owner,through,cutoff);
        return json({ok:true});
      }
      if(id==='privacy'){
        if(typeof data.enabled!=='boolean')error('Preferencia no válida.');
        if(data.enabled&&await presencePreference()!==1)error('Activa primero tu estado en línea en Mi perfil.');
        await db.batch([sql('INSERT INTO friend_activity_preferences(owner,enabled) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled',owner,+data.enabled),...(!data.enabled?[sql('DELETE FROM friend_activity WHERE owner=?',owner)]:[])]);
        return json({ok:true});
      }
      if(!['request','accept','decline','cancel','remove','block','unblock'].includes(id))error('Ruta no encontrada.',404);
      const person=await participant(data.username),target=person.owner,[left,right]=[owner,target].sort();
      if(id==='block'){
        const count=await first('SELECT count(*) AS n FROM friend_blocks WHERE owner=?',owner);
        if(count.n>=100&&!await first('SELECT 1 AS yes FROM friend_blocks WHERE owner=? AND other=?',owner,target))error('Límite de usuarios bloqueados alcanzado.',429);
        await run('INSERT OR IGNORE INTO friend_blocks(owner,other) VALUES(?,?)',owner,target);
        return json({ok:true});
      }
      if(id==='unblock'){await run('DELETE FROM friend_blocks WHERE owner=? AND other=?',owner,target);return json({ok:true});}
      if(id==='request')await cleanSocial();
      const existing=await related(target);
      if(data.requestId!==undefined&&(!existing||positive(data.requestId)!==existing.id))error('Solicitud no disponible.',404);
      if(id==='cancel'){
        if(!existing||!await first('DELETE FROM friend_links WHERE id=? AND accepted=0 AND requested_by=? AND created>=? RETURNING id',existing.id,owner,cutoff))
          error('Solicitud enviada no disponible.',404);
        return json({ok:true});
      }
      if(id==='remove'||id==='decline'){
        if(!existing||(id==='remove'?!existing.accepted:!!existing.accepted))error('Solicitud o amistad no disponible.',404);
        if(id==='decline'){
          if(existing.requested_by===owner||existing.created<cutoff)error('Solicitud recibida no disponible.',404);
          // Only a recipient's explicit rejection creates a notice. Cancellation,
          // expiry and blocking do not reveal a separate rejection.
          await db.batch([sql("INSERT OR IGNORE INTO friend_outcome_notices(owner,actor,request_id,kind,created) SELECT requested_by,?,id,'declined',? FROM friend_links WHERE id=? AND accepted=0 AND requested_by<>? AND (a=? OR b=?) AND created>=?",owner,timestamp,existing.id,owner,owner,owner,cutoff),sql('DELETE FROM friend_links WHERE id=? AND (a=? OR b=?) AND accepted=0 AND requested_by<>? AND created>=?',existing.id,owner,owner,owner,cutoff)]);
        }else await run('DELETE FROM friend_links WHERE id=? AND (a=? OR b=?) AND accepted=1',existing.id,owner,owner);
        return json({ok:true});
      }
      if(person.blocked_until>timestamp||await first('SELECT 1 AS yes FROM friend_blocks WHERE (owner=? AND other=?) OR (owner=? AND other=?)',owner,target,target,owner))error('Usuario no disponible.',404);
      const settings=await first('SELECT readonly FROM settings WHERE id=1');
      if(!settings||settings.readonly)error('La comunidad está en modo de solo lectura.',403);
      if(id==='request'){
        if(existing)error('Ya existe una amistad o solicitud pendiente.',409);
        await throttle('friend-request:'+owner,10,86400);
        await run('INSERT INTO friend_links(a,b,requested_by,created) VALUES(?,?,?,?)',left,right,owner,timestamp);
        return json({ok:true},201);
      }
      if(!existing||existing.accepted||existing.requested_by===owner)error('Solicitud no disponible.',404);
      const accepted=await first('UPDATE friend_links SET accepted=1 WHERE id=? AND accepted=0 AND requested_by<>? AND (a=? OR b=?) AND created>=? RETURNING id',existing.id,owner,owner,owner,cutoff);
      if(!accepted)error('Solicitud no disponible.',404);
      return json({ok:true});
    }
    const chatId=positive(id);
    if(!chatId)error('Conversación no disponible.',404);
    const friend=await first("SELECT f.id,p.username,s.blocked_until FROM friend_links f JOIN profiles p ON p.owner=CASE WHEN f.a=? THEN f.b ELSE f.a END JOIN sessions s ON s.id=p.owner WHERE f.id=? AND f.accepted=1 AND (f.a=? OR f.b=?) AND NOT EXISTS(SELECT 1 FROM friend_blocks WHERE (owner=f.a AND other=f.b) OR (owner=f.b AND other=f.a))",owner,chatId,owner,owner);
    if(!friend)error('Conversación no disponible.',404);
    if(method==='GET'&&action==='photo'){
      const message=positive(query.get('message'));
      const row=message?await first('SELECT photo FROM private_messages WHERE id=? AND friendship=? AND created>=? AND photo IS NOT NULL',message,chatId,cutoff):null;
      if(!row)error('Imagen no disponible.',404);
      const bytes=imageBytes(row.photo);
      return new Response(bytes,{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
    }
    if(method==='GET'&&!action){
      const after=positive(query.get('after')),before=positive(query.get('before'));
      if(after&&before)error('Cursor no válido.');
      const rows=await all("SELECT m.id,m.sender=? AS own,m.body,m.created,m.read_at IS NOT NULL AS read,m.reply_to,m.photo IS NOT NULL AS hasPhoto,CASE WHEN r.created>=? THEN substr(r.body,1,160) ELSE NULL END AS reply_body FROM private_messages m LEFT JOIN private_messages r ON r.id=m.reply_to AND r.friendship=m.friendship WHERE m.friendship=? AND m.created>=?"+(after?' AND m.id>?':before?' AND m.id<?':'')+' ORDER BY m.id '+(after?'ASC':'DESC')+' LIMIT 41',owner,cutoff,chatId,cutoff,...(after?[after]:before?[before]:[]));
      const more=rows.length>40,visible=rows.slice(0,40);if(!after)visible.reverse();
      const recent=after&&query.get('updates')==='1'?await all('SELECT id,read_at IS NOT NULL AS read FROM private_messages WHERE friendship=? AND created>=? ORDER BY id DESC LIMIT 40',chatId,cutoff):[];
      const ids=[...new Set([...visible,...recent].map(r=>r.id))];
      const reactions=ids.length?await all('SELECT message,emoji,count(*) AS total,max(owner=?) AS own FROM private_message_reactions WHERE message IN ('+ids.map(()=>'?').join(',')+') GROUP BY message,emoji',owner,...ids):[];
      for(const row of [...visible,...recent])row.reactions=reactions.filter(r=>r.message===row.id).map(r=>({emoji:r.emoji,total:r.total,own:!!r.own}));
      return json({username:friend.username,rows:visible,recent,more,canSend:friend.blocked_until<=timestamp});
    }
    if(method!=='POST')error('Ruta no encontrada.',404);
    const data=await body(request,action==='send'?240000:24576);
    if(action==='read'){
      const ids=Array.isArray(data.ids)?data.ids:[];
      if(!ids.length||ids.length>40||ids.some(value=>!positive(value)))error('Mensaje no válido.');
      await run('UPDATE private_messages SET read_at=? WHERE friendship=? AND sender<>? AND read_at IS NULL AND created>=? AND id IN ('+ids.map(()=>'?').join(',')+')',timestamp,chatId,owner,cutoff,...ids.map(Number));
      return json({ok:true});
    }
    if(!['send','react'].includes(action))error('Ruta no encontrada.',404);
    if(friend.blocked_until>timestamp)error('Usuario no disponible.',403);
    const settings=await first('SELECT readonly FROM settings WHERE id=1');
    if(!settings||settings.readonly)error('La comunidad está en modo de solo lectura.',403);
    if(action==='react'){
      const message=positive(data.message);
      if(!message||!await first('SELECT id FROM private_messages WHERE id=? AND friendship=? AND created>=?',message,chatId,cutoff))error('Mensaje no disponible.',404);
      if(data.emoji!==null&&!['👍','❤️','😂','😮'].includes(data.emoji))error('Reacción no válida.');
      await throttle('chat-react:'+owner,40,60);
      if(data.emoji===null)await run('DELETE FROM private_message_reactions WHERE message=? AND owner=?',message,owner);
      else await run('INSERT INTO private_message_reactions(message,owner,emoji) VALUES(?,?,?) ON CONFLICT(message,owner) DO UPDATE SET emoji=excluded.emoji',message,owner,data.emoji);
      return json({ok:true});
    }
    const photo=data.photo==null?null:data.photo;
    if(photo!==null)imageBytes(photo);
    const message=field(data.body||'',2000,photo===null?1:0)||'[Imagen]';
    const reply=data.replyTo==null?null:positive(data.replyTo);
    if(data.replyTo!=null&&!reply)error('Respuesta no válida.');
    const quoted=reply?await first('SELECT substr(body,1,160) AS body FROM private_messages WHERE id=? AND friendship=? AND created>=?',reply,chatId,cutoff):null;
    if(reply&&!quoted)error('El mensaje al que respondes ya no está disponible.',404);
    await throttle('chat-minute:'+owner,20,60);
    await throttle('chat-hour:'+owner,100,3600);
    if(Math.random()<.1)await cleanSocial();
    const row=await first('INSERT INTO private_messages(friendship,sender,body,created,reply_to,photo) VALUES(?,?,?,?,?,?) RETURNING id',chatId,owner,message,timestamp,reply,photo);
    return json({id:row.id,created:timestamp,body:message,reply_to:reply,reply_body:quoted?.body||null,hasPhoto:photo!==null,read:0,reactions:[]},201);
  }
  if(resource==='presence'&&method==='POST'){
    const data=await body(request,12000);
    if(id==='preference'&&!action){
      if(!who?.username||who.username==='Ally')error('Accede a tu perfil.',401);
      if(typeof data.enabled!=='boolean')error('Preferencia no válida.');
      await db.batch([sql('INSERT INTO presence_preferences(owner,enabled) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled',owner,+data.enabled),...(!data.enabled?[sql('DELETE FROM profile_presence WHERE owner=?',owner),sql('DELETE FROM friend_activity WHERE owner=?',owner)]:[])]);
      return json({enabled:data.enabled});
    }
    if(id)error('Ruta no encontrada.',404);
    if(!Array.isArray(data.names)||data.names.length>80||data.names.some(n=>typeof n!=='string'||!/^[A-Za-z0-9_]{3,20}$/.test(n)))error('Consulta no válida.');
    const names=[...new Set(data.names.map(n=>n.toLowerCase()))];
    if(data.heartbeat===true&&who?.username&&who.username!=='Ally'&&who.blocked_until<=timestamp){
      // A single short-lived row per consenting profile; no per-device history.
      await run('INSERT INTO profile_presence(owner,expires) SELECT owner,? FROM presence_preferences WHERE owner=? AND enabled=1 ON CONFLICT(owner) DO UPDATE SET expires=excluded.expires WHERE profile_presence.expires<=?',timestamp+150,owner,timestamp+105);
      await run('INSERT INTO friend_activity(owner,last_active) SELECT pp.owner,? FROM presence_preferences pp JOIN friend_activity_preferences fp ON fp.owner=pp.owner AND fp.enabled=1 WHERE pp.owner=? AND pp.enabled=1 ON CONFLICT(owner) DO UPDATE SET last_active=excluded.last_active WHERE friend_activity.last_active<=?',timestamp,owner,timestamp-45);
    }
    if(data.heartbeat===true||Math.random()<.05)await run('DELETE FROM profile_presence WHERE rowid IN (SELECT rowid FROM profile_presence WHERE expires<=? LIMIT 100)',timestamp);
    if(!names.length)return json({online:[]});
    const rows=await all("SELECT pr.username FROM profiles pr JOIN presence_preferences pp ON pp.owner=pr.owner AND pp.enabled=1 JOIN profile_presence ps ON ps.owner=pr.owner JOIN sessions s ON s.id=pr.owner WHERE ps.expires>? AND s.blocked_until<=? AND pr.username<>'Ally' COLLATE NOCASE AND pr.username COLLATE NOCASE IN ("+names.map(()=>'?').join(',')+")",timestamp,timestamp,...names);
    return json({online:rows.map(r=>r.username)});
  }
  if(resource==='meta'&&method==='GET'){
    let headers={};
    if(who&&device&&device.expires<timestamp+12960000){
      await run('UPDATE profile_devices SET expires=? WHERE id=? AND expires>?',timestamp+15552000,credential,timestamp);
      headers={'Set-Cookie':sessionCookie(cookie)};
    }
    return json({categories:await all('SELECT id,name FROM categories WHERE hidden=0 ORDER BY position,id'),
      session:!!who,profile:publicProfile(who),presenceSharing:await presencePreference(),siteKey:env.TURNSTILE_SITE_KEY||null,settings:await first('SELECT readonly,stop_posts,review FROM settings WHERE id=1')},200,headers);
  }
  if(resource==='profile'&&method==='GET'){
    if(!who?.username)error('Crea o recupera tu perfil.',401);
    const counts=await first("SELECT (SELECT count(*) FROM posts WHERE owner=? AND status IN ('public','pending')) AS posts,(SELECT count(*) FROM comments WHERE owner=? AND status IN ('public','pending')) AS comments,(SELECT count(*) FROM votes WHERE owner=?) AS votes",owner,owner,owner);
    const deviceKey=await first('SELECT device_key_hash IS NOT NULL AS enabled FROM profiles WHERE owner=?',owner);
    const devices=await first('SELECT count(*) AS total FROM profile_devices WHERE owner=? AND expires>?',owner,timestamp);
    return json({profile:publicProfile(who),counts,deviceKeyEnabled:!!deviceKey?.enabled,presenceSharing:await presencePreference(),activeDevices:Number(devices.total)});
  }
  if(resource==='profile'&&method==='POST'){
    if(!who)error('Verifica tu sesión primero.',401);
    if(who.blocked_until>timestamp)error('Esta sesión está restringida.',403);
    const data=await body(request);
    if(id==='public-details'){
      if(!who.username||who.username==='Ally')error('Accede a tu perfil.',401);
      const settings=await first('SELECT * FROM settings WHERE id=1');
      if(!settings||settings.readonly)error('La comunidad está en modo de solo lectura.',403);
      await throttle('public-profile:'+owner,10,3600);
      if(!['🎮','🤖','🕹️','👾','🚀','🐉','⚡','🐱'].includes(data.avatar)||!['purple','green','blue','orange'].includes(data.color))error('Personalización no válida.');
      const bio=field(data.bio||'',280),model=field(data.model||'',60);
      await run('INSERT INTO profile_public_details(owner,avatar,bio,model,color) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET avatar=excluded.avatar,bio=excluded.bio,model=excluded.model,color=excluded.color',owner,data.avatar,bio,model,data.color);
      return json({ok:true});
    }
    if(id==='revoke-other-devices'){
      if(!who.username||!device||device.expires<=timestamp)error('Necesitas una sesión de perfil activa.',401);
      await throttle('revoke-devices:'+owner,5,3600);
      await run('DELETE FROM profile_devices WHERE owner=? AND id<>?',owner,credential);
      return json({ok:true});
    }
    if(id==='device-key'){
      if(!who.username)error('Crea o recupera tu perfil primero.',401);
      await throttle('device-key:'+owner,3,3600);
      // Solo se muestra una vez. SHA-256 es adecuado para una clave aleatoria de 256 bits.
      const key=token();
      await run('UPDATE profiles SET device_key_hash=? WHERE owner=?',await digest(key),owner);
      return json({key});
    }
    if(id==='device-login'){
      if(who.username)error('Cierra tu perfil antes de acceder con otra cuenta.',409);
      const username=field(data.username,20,3);
      const accessKey=field(data.key,64,64).toLowerCase();
      if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)||!/^[a-f0-9]{64}$/.test(accessKey))
        error('Usuario o clave de acceso incorrectos.',401);
      const ip=request.headers.get('CF-Connecting-IP');
      if(!ip||!env.RATE_SECRET||env.RATE_SECRET.length<32)error('El acceso no está disponible temporalmente.',503);
      const encoder=new TextEncoder();
      const signer=await crypto.subtle.importKey('raw',encoder.encode(env.RATE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const hour=Math.floor(timestamp/3600);
      const fingerprint=async suffix=>Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',signer,encoder.encode('access:'+hour+':'+ip+':'+suffix))),v=>v.toString(16).padStart(2,'0')).join('');
      // Límites por IP y por combinación IP/usuario: no se almacena la IP en claro.
      await throttle('device-ip:'+await fingerprint('all'),40,3600);
      await throttle('device-account:'+await fingerprint(username.toLowerCase()),10,3600);
      const profile=await first("SELECT p.owner,s.blocked_until FROM profiles p JOIN sessions s ON s.id=p.owner WHERE p.username=? AND p.username<>'Ally' COLLATE NOCASE AND p.device_key_hash=?",username,await digest(accessKey));
      if(!profile)error('Usuario o clave de acceso incorrectos.',401);
      if(profile.blocked_until>timestamp)error('Este perfil tiene el acceso restringido.',403);
      const key=token();
      await run('INSERT INTO profile_devices(id,owner,expires) VALUES(?,?,?)',await digest(key),profile.owner,timestamp+15552000);
      return json({ok:true},200,{'Set-Cookie':sessionCookie(key)});
    }
    if(id==='recover'){
      if(who.username)error('Cierra tu perfil antes de recuperar otro.',409);
      await throttle('recover:'+owner,6,3600);
      const code=field(data.code,64,64).toLowerCase();
      if(!/^[a-f0-9]{64}$/.test(code))error('Código de recuperación incorrecto.',400);
      const profile=await first("SELECT owner FROM profiles WHERE recovery_hash=? AND username<>'Ally' COLLATE NOCASE",await digest(code));
      if(!profile)error('Código de recuperación incorrecto.',400);
      const key=token();
      await run('INSERT INTO profile_devices(id,owner,expires) VALUES(?,?,?)',await digest(key),profile.owner,timestamp+15552000);
      return json({ok:true},200,{'Set-Cookie':sessionCookie(key)});
    }
    if(id==='logout'){
      if(device)await run('DELETE FROM profile_devices WHERE id=?',credential);
      return json({ok:true},200,{'Set-Cookie':'__Host-ally_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax'});
    }
    if(id==='rotate'){
      if(!who.username)error('No tienes perfil.',401);
      await throttle('rotate:'+owner,3,3600);
      const code=token();
      await run('UPDATE profiles SET recovery_hash=? WHERE owner=?',await digest(code),owner);
      return json({recovery:code});
    }
    if(id==='claim-admin'){
      if(!who.username)error('Crea tu perfil primero.',400);
      await throttle('admin-claim:'+owner,5,3600);
      await admin(request,env);
      if(await first("SELECT owner FROM profiles WHERE role='admin' AND owner<>?",owner))error('Ya existe un perfil administrador.',409);
      await run("UPDATE profiles SET role='admin' WHERE owner=?",owner);
      return json({ok:true});
    }
    if(id)error('Ruta no encontrada.',404);
    if(who.username)error('Ya tienes un nombre reservado.',409);
    await throttle('profile:'+owner,8,3600);
    const username=field(data.username,20,3);
    if(!/^[a-zA-Z0-9_]{3,20}$/.test(username))error('Usa de 3 a 20 letras, números o guiones bajos.');
    if(/^(admin|administrador|moderador|moderation|moderator|staff|ally|allylab|allycommunity|soporte|support|official|oficial)([0-9_]*$)/i.test(username))error('Nombre reservado. Elige otro.');
    const code=token(),key=token();
    const recoveryHash=await digest(code),deviceHash=await digest(key);
    await db.batch([sql('INSERT INTO profiles(owner,username,recovery_hash,created) VALUES(?,?,?,?)',owner,username,recoveryHash,timestamp),sql('INSERT INTO profile_devices(id,owner,expires) VALUES(?,?,?)',deviceHash,owner,timestamp+15552000)]);
    return json({profile:{username,created:timestamp,role:'member'},recovery:code},201,{'Set-Cookie':sessionCookie(key)});
  }
  if(resource==='session'&&method==='POST'){
    if(who)return json({ok:true});
    const data=await body(request);
    const ip=request.headers.get('CF-Connecting-IP');
    if(!ip||!env.RATE_SECRET||env.RATE_SECRET.length<32)error('La participación aún no está habilitada.',503);
    const encoder=new TextEncoder();
    const keyMaterial=await crypto.subtle.importKey('raw',encoder.encode(env.RATE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const fingerprint=await crypto.subtle.sign('HMAC',keyMaterial,encoder.encode(Math.floor(timestamp/3600)+':'+ip));
    const bucket=Array.from(new Uint8Array(fingerprint),v=>v.toString(16).padStart(2,'0')).join('');
    await throttle('s:'+bucket,12,3600);
    await verifyTurnstile(env,request,data.token);
    if(Math.random()<0.03)await run('DELETE FROM rate WHERE rowid IN (SELECT rowid FROM rate WHERE expires<? LIMIT 100)',timestamp);
    const key=token();
    await run('INSERT INTO sessions(id,expires) VALUES(?,?)',await digest(key),timestamp+15552000);
    return json({ok:true},201,{'Set-Cookie':'__Host-ally_session='+key+'; Path=/; Max-Age=15552000; Secure; HttpOnly; SameSite=Lax'});
  }
  if(resource==='admin-notices'){
    if(who?.role!=='admin')error('Acceso reservado al administrador.',403);
    if(method==='GET'&&!id){
      const unread=await first('SELECT count(*) AS total FROM admin_notifications WHERE owner=? AND read_at IS NULL',owner);
      if(query.get('count')==='1')return json({unread:Number(unread?.total)||0});
      const before=positive(query.get('before'));
      const rows=await all('SELECT id,title,message,created,read_at FROM admin_notifications WHERE owner=?'+(before?' AND id<?':'')+' ORDER BY id DESC LIMIT 26',owner,...(before?[before]:[]));
      return json({rows:rows.slice(0,25),next:rows.length>25?rows[24].id:null,unread:Number(unread?.total)||0});
    }
    if(method==='POST'&&id==='read'&&!action){
      const data=await body(request);
      const through=positive(data.through);
      if(!through)error('Aviso no válido.');
      await run('UPDATE admin_notifications SET read_at=? WHERE owner=? AND id<=? AND read_at IS NULL',timestamp,owner,through);
      const unread=await first('SELECT count(*) AS total FROM admin_notifications WHERE owner=? AND read_at IS NULL',owner);
      return json({ok:true,unread:Number(unread?.total)||0});
    }
    error('Ruta no encontrada.',404);
  }
  if(resource==='notices'&&method==='GET'){
    const cursor=who?.username?(await first('SELECT through_id FROM notice_read_cursor WHERE owner=?',owner))?.through_id||0:0;
    const rows=who?await all('SELECT id,post,message,created FROM notices WHERE owner=? ORDER BY id DESC LIMIT 30',owner):[];
    return json({rows,unread:rows.filter(r=>r.id>cursor).length,through:cursor});
  }
  if(resource==='notices'&&id==='read'&&method==='POST'){
    if(!who?.username)error('Accede a tu perfil.',401);
    const data=await body(request),through=positive(data.through);
    if(!through||!await first('SELECT id FROM notices WHERE owner=? AND id=?',owner,through))error('Aviso no válido.');
    await run('INSERT INTO notice_read_cursor(owner,through_id) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET through_id=max(through_id,excluded.through_id)',owner,through);
    return json({ok:true});
  }
  // Solo configuraciones públicas: no se incluyen usuarios, mensajes privados, fotos ni datos de sesión.
  if(resource==='public-search'&&method==='GET'&&!id){
    const words=(query.get('q')||'').slice(0,100).match(/[\p{L}\p{N}]+/gu)?.slice(0,8)||[];
    if(!words.length)return json({rows:[]},200,{'Access-Control-Allow-Origin':'https://ally-lab.pages.dev'});
    const rows=await all("SELECT p.id,p.title,k.name AS category,substr(p.body,1,300) AS excerpt,substr(c.body,1,500) AS solution FROM post_search s JOIN posts p ON p.id=s.rowid JOIN categories k ON k.id=p.category LEFT JOIN accepted_solutions a ON a.post=p.id LEFT JOIN comments c ON c.id=a.comment AND c.post=p.id AND c.status='public' WHERE post_search MATCH ? AND p.status='public' AND k.hidden=0 ORDER BY (c.id IS NOT NULL) DESC,p.score DESC,p.id DESC LIMIT 12",words.map(v=>'"'+v+'"*').join(' AND '));
    return json({rows},200,{'Access-Control-Allow-Origin':'https://ally-lab.pages.dev'});
  }
  if(resource==='benchmarks'&&method==='GET'&&!id){
    const game=gameId(query.get('game'));
    if(!game)error('Identificador de juego no válido.');
    const candidates=await all("SELECT p.id,p.created,p.config FROM posts p JOIN categories c ON c.id=p.category WHERE p.game=? AND p.status='public' AND c.hidden=0 AND p.config IS NOT NULL ORDER BY p.id DESC LIMIT 50",game);
    const rows=[];
    for(const item of candidates){
      let config;try{config=JSON.parse(item.config);}catch{continue;}
      if(!config||typeof config!=='object')continue;
      const fpsText=String(config.fps||'').trim();
      if(!/^\d{1,3}(?:[.,]\d{1,2})?(?:\s*fps)?$/i.test(fpsText))continue;
      const fps=Number.parseFloat(fpsText.replace(',','.'));
      if(!Number.isFinite(fps)||fps<1||fps>360||!config.model||!config.resolution)continue;
      const safe={};
      for(const field of ['model','resolution','quality','tdp','vram','scaling','frameGeneration','power','version','driver'])if(typeof config[field]==='string')safe[field]=config[field].slice(0,100);
      rows.push({id:item.id,created:item.created,fps,...safe});
      if(rows.length>=20)break;
    }
    return json({game,rows},200,{'Access-Control-Allow-Origin':'https://ally-lab.pages.dev'});
  }
  if(resource==='stats'&&method==='GET'){
    const cacheKey=new Request(url.origin+'/api/stats-snapshot');
    const cached=globalThis.caches?.default&&await caches.default.match(cacheKey);
    if(cached)return cached;
    const totals=await first("SELECT count(*) AS posts,coalesce(sum(replies),0) AS comments,coalesce(sum(views),0) AS uniqueViews,coalesce(sum(config IS NOT NULL),0) AS configurations,coalesce(sum(debate=1 AND created>=?),0) AS recentDebates FROM posts WHERE status='public' AND category IN (SELECT id FROM categories WHERE hidden=0)",timestamp-604800);
    const categories=await all("SELECT c.name,count(*) AS total FROM posts p JOIN categories c ON c.id=p.category WHERE p.status='public' AND c.hidden=0 GROUP BY c.id ORDER BY total DESC LIMIT 5");
    const best=await all("SELECT id,title,score FROM posts WHERE status='public' AND category IN (SELECT id FROM categories WHERE hidden=0) ORDER BY score DESC,id DESC LIMIT 5");
    const mostVisited=await all("SELECT id,title,views FROM posts WHERE status='public' AND views>0 AND category IN (SELECT id FROM categories WHERE hidden=0) ORDER BY views DESC,id DESC LIMIT 5");
    const response=json({totals,categories,best,mostVisited},200,{'Cache-Control':'public, max-age=60, s-maxage=60'});
    if(globalThis.caches?.default)await caches.default.put(cacheKey,response.clone()).catch(()=>{});
    return response;
  }
  if(resource==='posts'&&method==='GET'){
    const projection=`p.id,p.category,c.name AS categoryName,p.title,p.game,p.tags,p.config,p.debate,p.created,p.score,p.replies,p.views,p.pinned,p.closed,json_array_length(p.photos) AS photoCount,p.owner=? AS own,(SELECT username FROM profiles WHERE owner=p.owner) AS username,(SELECT role FROM profiles WHERE owner=p.owner) AS role,
      coalesce((SELECT value FROM votes WHERE owner=? AND kind='post' AND target=p.id),0) AS vote,
       (SELECT count(*) FROM votes WHERE kind='post' AND target=p.id AND value=1) AS likes`;
    if(id){
      const item=await first('SELECT '+projection+',p.body,p.status FROM posts p JOIN categories c ON c.id=p.category WHERE p.id=? AND c.hidden=0 AND (p.status=\'public\' OR (p.owner=? AND p.status=\'pending\'))',who?.id??null,who?.id??null,positive(id),who?.id??null);
      if(!item)error('Publicación no disponible.',404);
      return json(item);
    }
    const search=(query.get('q')||'').slice(0,100).match(/[\p{L}\p{N}]+/gu)?.slice(0,8);
    const category=positive(query.get('category')), game=gameId(query.get('game'));
    const orders={recent:'p.id',popular:'p.score',comments:'p.replies',trend:'(p.score+2*p.replies)',views:'p.views'};
    const sort=query.get('sort')||'recent', order=Object.hasOwn(orders,sort)?orders[sort]:orders.recent;
    const pinRank=sort==='views'?'CAST(0 AS INTEGER)':'p.pinned';
    const conditions=["p.status='public'","c.hidden=0"], values=[who?.id??null,who?.id??null];
    if(search?.length){conditions.push('p.id IN (SELECT rowid FROM post_search WHERE post_search MATCH ? LIMIT 200)');values.push(search.map(v=>'"'+v+'"*').join(' AND '));}
    if(category){conditions.push('p.category=?');values.push(category);}
    if(game){conditions.push('p.game=?');values.push(game);}
    if(sort==='trend'){conditions.push('p.created>=?');values.push(timestamp-604800);}
    const cursor=(query.get('after')||'').split(':');
    if(cursor.length===3&&cursor.every(v=>/^-?\d{1,15}$/.test(v))){
      conditions.push('('+pinRank+','+order+',p.id)<(?,?,?)');values.push(...cursor.map(Number));
    }
    const rows=await all('SELECT '+projection+',substr(p.body,1,320) AS body,'+order+' AS ranking FROM posts p JOIN categories c ON c.id=p.category WHERE '+conditions.join(' AND ')+' ORDER BY '+pinRank+' DESC,ranking DESC,p.id DESC LIMIT '+(limit+1),...values);
    const more=rows.length>limit;
    const visible=rows.slice(0,limit), last=visible.at(-1);

    // Una sola consulta para los dos comentarios públicos más recientes de
    // cada publicación de esta página. Incluye respuestas anidadas sin
    // mostrar comentarios pendientes, ocultos o eliminados.
    const latestByPost=new Map(visible.map(post=>[post.id,[]]));
    if(visible.length){
      const ids=visible.map(post=>post.id);
      const placeholders=ids.map(()=>'?').join(',');
      const recent=await all(`SELECT id,post,body,bodyLength,created,username,role,photoCount FROM (
        SELECT cm.id,cm.post,substr(cm.body,1,601) AS body,
          length(cm.body) AS bodyLength,cm.created,pr.username,pr.role,json_array_length(cm.photos) AS photoCount,
          row_number() OVER (PARTITION BY cm.post ORDER BY cm.created DESC,cm.id DESC) AS position
        FROM comments cm LEFT JOIN profiles pr ON pr.owner=cm.owner
        WHERE cm.status='public' AND cm.post IN (${placeholders})
      ) WHERE position<=2 ORDER BY post,position`,...ids);
      for(const comment of recent)latestByPost.get(comment.post)?.push(comment);
    }
    const feed=visible.map(post=>({...post,latestComments:latestByPost.get(post.id)||[]}));
    return json({rows:feed,next:more?[sort==='views'?0:last.pinned,last.ranking,last.id].join(':'):null});
  }
  if(resource==='comments'&&method==='GET'){
    const post=positive(query.get('post')), parent=positive(query.get('parent'));
    const sort=query.get('sort')==='popular'?'c.score':'c.id';
    const cursor=(query.get('after')||'').match(/^(-?\d{1,15}):(\d{1,15})$/);
    const rows=await all(`SELECT c.id,c.post,c.parent,c.depth,c.created,c.status,CASE WHEN c.status='public' THEN c.body ELSE '' END AS body,
      c.score,CASE WHEN c.status='public' THEN json_array_length(c.photos) ELSE 0 END AS photoCount,c.owner=? AS own,c.owner=p.owner AS author,(SELECT username FROM profiles WHERE owner=c.owner) AS username,(SELECT role FROM profiles WHERE owner=c.owner) AS role,${sort} AS ranking,
      EXISTS(SELECT 1 FROM comments child WHERE child.parent=c.id AND child.status IN ('public','deleted')) AS children,
      coalesce((SELECT value FROM votes WHERE owner=? AND kind='comment' AND target=c.id),0) AS vote,
      (SELECT count(*) FROM votes WHERE kind='comment' AND target=c.id AND value=1) AS likes
      FROM comments c JOIN posts p ON p.id=c.post JOIN categories k ON k.id=p.category
      WHERE p.status='public' AND k.hidden=0 AND c.post=? AND c.parent IS ? AND c.status IN ('public','deleted')
      ${cursor?'AND ('+sort+',c.id)<(?,?)':''} ORDER BY ranking DESC,c.id DESC LIMIT 21`,who?.id??null,who?.id??null,post,parent,...(cursor?[+cursor[1],+cursor[2]]:[]));
    const visible=rows.slice(0,20), last=visible.at(-1);
    return json({rows:visible,next:rows.length>20?last.ranking+':'+last.id:null});
  }
  if(method!=='POST')error('Ruta no encontrada.',404);
  if(!who)error('Verifica la sesión anónima para participar.',401);
  if(who.blocked_until>timestamp)error('Esta sesión está restringida.',403);
  if(!who.username)error('Elige tu nombre de usuario para participar.',403);
  const supportsPhotos=['posts','comments'].includes(resource)&&(!id||action==='edit');
  const data=await body(request,supportsPhotos?650000:24576), settings=await first('SELECT * FROM settings WHERE id=1');
  if(!settings||settings.readonly)error('La comunidad está en modo de solo lectura.',403);
  const target=positive(id);
  if(resource==='posts'&&!id){
    if(settings.stop_posts)error('Las publicaciones nuevas están temporalmente desactivadas.',403);
    const photos=photosOf(data,3)??'[]';
    const title=field(data.title,150,4), content=field(data.body,5000,photos==='[]'?4:0), category=positive(data.category);
    if(!await first('SELECT id FROM categories WHERE id=? AND hidden=0',category))error('Categoría no disponible.');
    const game=gameId(data.game), debate=+!!data.debate;
    if((data.game||debate||data.config)&&!game)error('Identificador de juego no válido.');
    const tags=(Array.isArray(data.tags)?data.tags:[]).slice(0,5).map(v=>field(v,24,1));
    const config=data.config?Object.fromEntries(configFields.flatMap(key=>typeof data.config[key]==='string'&&data.config[key].trim()?[[key,field(data.config[key],500)]]:[])):null;
    if(config&&(!config.model||!config.resolution))error('Indica modelo y resolución.');
    if(debate){
      const existing=await first("SELECT id,status,owner FROM posts WHERE debate=1 AND game=? AND status NOT IN ('deleted','hidden')",game);
      if(existing){
        if(existing.status==='pending'&&existing.owner!==owner)error('El debate está pendiente de revisión.',409);
        return json({id:existing.id,status:existing.status});
      }
    }
    await throttle('p:'+owner,5,3600);
    const hash=await digest((title+'\n'+content).normalize('NFC').toLowerCase().replace(/\s+/g,' '));
    const status=settings.review?'pending':'public';
    const row=await first(`INSERT INTO posts(owner,category,title,body,game,tags,config,debate,status,hash,created,photos)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM posts WHERE owner=? AND hash=? AND created>?) RETURNING id`,
      owner,category,title,content,game,JSON.stringify(tags),config?JSON.stringify(config):null,debate,status,hash,timestamp,photos,owner,hash,timestamp-86400);
    if(!row)error('Ya has publicado ese contenido recientemente.',409);
    return json({...row,status},201);
  }
  if(resource==='comments'&&!id){
    await throttle('c:'+owner,20,600);
    const photos=photosOf(data,2)??'[]';
    const post=positive(data.post), parent=positive(data.parent), content=field(data.body,2000,photos==='[]'?2:0);
    const status=settings.review?'pending':'public';
    const row=await first(`INSERT INTO comments(post,parent,depth,owner,body,status,created,photos)
      SELECT p.id,?,coalesce(c.depth+1,0),?,?,?,?,? FROM posts p
      JOIN categories k ON k.id=p.category LEFT JOIN comments c ON c.id=? AND c.post=p.id AND c.status IN ('public','deleted') AND c.depth<3
      WHERE p.id=? AND p.status='public' AND p.closed=0 AND k.hidden=0 AND (? IS NULL OR c.id IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM comments d WHERE d.owner=? AND d.post=p.id AND d.body=? AND d.created>?) RETURNING id`,
      parent,owner,content,status,timestamp,photos,parent,post,parent,owner,content,timestamp-600);
    if(!row)error('El debate está cerrado, la respuesta está duplicada o el hilo alcanzó el límite.',409);
    return json({...row,status},201);
  }
  if(['posts','comments'].includes(resource)&&target&&['edit','delete'].includes(action)){
    await throttle('edit:'+owner,20,600);
    const table=resource, max=table==='posts'?5000:2000;
    const removal=action==='delete';
    const photos=removal?undefined:photosOf(data,table==='posts'?3:2);
    const existing=removal||photos!==undefined?null:await first('SELECT json_array_length(photos) AS n FROM '+table+' WHERE id=? AND owner=?',target,owner);
    const hasPhotos=photos!==undefined?photos!=='[]':!!existing?.n;
    const fields=removal?"body='',status='deleted',photos='[]'"+(table==='posts'?",title='[Publicación eliminada]',tags='[]',config=NULL":""):
      'body=?'+(table==='posts'?',title=?':'')+(photos!==undefined?',photos=?':'')+(settings.review?",status='pending'":"");
    const args=removal?[]:[field(data.body,max,hasPhotos?0:2),...(table==='posts'?[field(data.title,150,4)]:[]),...(photos!==undefined?[photos]:[])];
    if(!await first('UPDATE '+table+' SET '+fields+" WHERE id=? AND owner=? AND status IN ('public','pending') RETURNING id",...args,target,owner))error('Contenido propio no disponible.',404);
    return json({ok:true});
  }
  if(['vote','report'].includes(resource)){
    const kind=data.kind, item=positive(data.target);
    if(!['post','comment'].includes(kind)||!item)error('Contenido no válido.');
    const allowed=kind==='post'?"SELECT p.id FROM posts p JOIN categories k ON k.id=p.category WHERE p.id=? AND p.status='public' AND k.hidden=0":
      "SELECT c.id FROM comments c JOIN posts p ON p.id=c.post JOIN categories k ON k.id=p.category WHERE c.id=? AND c.status='public' AND p.status='public' AND k.hidden=0";
    if(resource==='vote'){
      if(![-1,0,1].includes(data.value))error('Voto no válido.');
      await throttle('v:'+owner,30,60);
      if(data.value===0)await run('DELETE FROM votes WHERE owner=? AND kind=? AND target=?',owner,kind,item);
      else if(!await first('INSERT INTO votes(owner,kind,target,value) SELECT ?,?,visible.id,? FROM ('+allowed+') visible WHERE true ON CONFLICT(owner,kind,target) DO UPDATE SET value=excluded.value RETURNING value',owner,kind,data.value,item))error('Contenido no disponible.',404);
      return json({ok:true});
    }
    if(!reasons.includes(data.reason))error('Motivo no válido.');
    await throttle('r:'+owner,10,3600);
    if(!await first(allowed,item))error('Contenido no disponible.',404);
    await run('INSERT INTO reports(owner,kind,target,reason,details,created) VALUES(?,?,?,?,?,?)',owner,kind,item,data.reason,field(data.details||'',1000),timestamp);
    return json({ok:true},201);
  }
  error('Ruta no encontrada.',404);
}

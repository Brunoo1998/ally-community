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

async function body(request){
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')error('Formato no admitido.',415);
  const reader=request.body?.getReader();
  if(!reader)error('Faltan datos.');
  const decoder=new TextDecoder();
  let size=0,value='';
  for(;;){
    const chunk=await reader.read();
    if(chunk.done)break;
    size+=chunk.value.byteLength;
    if(size>24576){await reader.cancel();error('Solicitud demasiado grande.',413);}
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
    if(/UNIQUE constraint/i.test(String(e)))return json({error:'Ese nombre o registro ya está reservado. Elige otro o actualiza la página.'},409);
    return json({error:'Servicio temporalmente no disponible. Inténtalo más tarde.'},503);
  }
}

async function route(request,env){
  const url=new URL(request.url), path=url.pathname.slice(5).split('/'), query=url.searchParams;
  const [resource,id,action]=path, method=request.method;
  if(path.length>3||action&&resource==='admin')error('Ruta no encontrada.',404);
  if(method!=='GET'&&(method!=='POST'||request.headers.get('Origin')!==url.origin))error('Origen o método no autorizado.',403);
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
  const throttle=async(key,max,window)=>{
    const expires=(Math.floor(timestamp/window)+1)*window;
    const row=await first('INSERT INTO rate VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits',key+':'+expires,expires,max);
    if(!row)error('Has alcanzado el límite. Inténtalo más tarde.',429);
  };
  if(resource==='admin'){
    await admin(request,env);
    if(method==='GET'){
      const tables=['posts','comments','reports','audit','categories','settings'];
      if(id==='export'){
        const table=query.get('table');
        if(![...tables,'sessions','votes','notices'].includes(table))error('Tabla no válida.');
        return json({rows:await all('SELECT rowid AS cursor,* FROM '+table+' WHERE rowid>? ORDER BY rowid LIMIT 200',positive(query.get('after'))||0)});
      }
      return json(Object.fromEntries(await Promise.all(tables.map(async table=>[table,await all('SELECT * FROM '+table+' ORDER BY id DESC LIMIT 50')]))));
    }
    const data=await body(request), target=positive(data.id);
    let statement,notice;
    if(id==='settings'){
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
      const seconds=Number(data.seconds);
      if(!Number.isInteger(seconds)||seconds<0||seconds>31536000)error('Duración no válida.');
      statement=sql('UPDATE sessions SET blocked_until=? WHERE id=?',data.permanent?253402300799:seconds?timestamp+seconds:0,data.owner);
    }else if(['post','comment'].includes(id)&&target){
      const table=id==='post'?'posts':'comments';
      const record=await first('SELECT * FROM '+table+' WHERE id=?',target);
      if(!record)error('Contenido no encontrado.',404);
      if(data.status==='deleted')statement=sql("UPDATE "+table+" SET status='deleted',body=''"+(id==='post'?",title='[Publicación eliminada]',tags='[]',config=NULL":"")+' WHERE id=?',target);
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
  if(resource==='meta'&&method==='GET'){
    let headers={};
    if(who&&device&&device.expires<timestamp+12960000){
      await run('UPDATE profile_devices SET expires=? WHERE id=? AND expires>?',timestamp+15552000,credential,timestamp);
      headers={'Set-Cookie':sessionCookie(cookie)};
    }
    return json({categories:await all('SELECT id,name FROM categories WHERE hidden=0 ORDER BY position,id'),
      session:!!who,profile:publicProfile(who),siteKey:env.TURNSTILE_SITE_KEY||null,settings:await first('SELECT readonly,stop_posts,review FROM settings WHERE id=1')},200,headers);
  }
  if(resource==='profile'&&method==='GET'){
    if(!who?.username)error('Crea o recupera tu perfil.',401);
    const counts=await first("SELECT (SELECT count(*) FROM posts WHERE owner=? AND status IN ('public','pending')) AS posts,(SELECT count(*) FROM comments WHERE owner=? AND status IN ('public','pending')) AS comments,(SELECT count(*) FROM votes WHERE owner=?) AS votes",owner,owner,owner);
    const deviceKey=await first('SELECT device_key_hash IS NOT NULL AS enabled FROM profiles WHERE owner=?',owner);
    return json({profile:publicProfile(who),counts,deviceKeyEnabled:!!deviceKey?.enabled});
  }
  if(resource==='profile'&&method==='POST'){
    if(!who)error('Verifica tu sesión primero.',401);
    if(who.blocked_until>timestamp)error('Esta sesión está restringida.',403);
    const data=await body(request);
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
      const profile=await first('SELECT p.owner,s.blocked_until FROM profiles p JOIN sessions s ON s.id=p.owner WHERE p.username=? AND p.device_key_hash=?',username,await digest(accessKey));
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
      const profile=await first('SELECT owner FROM profiles WHERE recovery_hash=?',await digest(code));
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
  if(resource==='notices'&&method==='GET'){
    return json({rows:who?await all('SELECT id,post,message,created FROM notices WHERE owner=? ORDER BY id DESC LIMIT 30',owner):[]});
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
    const projection=`p.id,p.category,c.name AS categoryName,p.title,p.game,p.tags,p.config,p.debate,p.created,p.score,p.replies,p.views,p.pinned,p.closed,p.owner=? AS own,(SELECT username FROM profiles WHERE owner=p.owner) AS username,(SELECT role FROM profiles WHERE owner=p.owner) AS role,
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
    return json({rows:visible,next:more?[sort==='views'?0:last.pinned,last.ranking,last.id].join(':'):null});
  }
  if(resource==='comments'&&method==='GET'){
    const post=positive(query.get('post')), parent=positive(query.get('parent'));
    const sort=query.get('sort')==='popular'?'c.score':'c.id';
    const cursor=(query.get('after')||'').match(/^(-?\d{1,15}):(\d{1,15})$/);
    const rows=await all(`SELECT c.id,c.post,c.parent,c.depth,c.created,c.status,CASE WHEN c.status='public' THEN c.body ELSE '' END AS body,
      c.score,c.owner=? AS own,c.owner=p.owner AS author,(SELECT username FROM profiles WHERE owner=c.owner) AS username,(SELECT role FROM profiles WHERE owner=c.owner) AS role,${sort} AS ranking,
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
  const data=await body(request), settings=await first('SELECT * FROM settings WHERE id=1');
  if(!settings||settings.readonly)error('La comunidad está en modo de solo lectura.',403);
  const target=positive(id);
  if(resource==='posts'&&!id){
    if(settings.stop_posts)error('Las publicaciones nuevas están temporalmente desactivadas.',403);
    const title=field(data.title,150,4), content=field(data.body,5000,4), category=positive(data.category);
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
    const row=await first(`INSERT INTO posts(owner,category,title,body,game,tags,config,debate,status,hash,created)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM posts WHERE owner=? AND hash=? AND created>?) RETURNING id`,
      owner,category,title,content,game,JSON.stringify(tags),config?JSON.stringify(config):null,debate,status,hash,timestamp,owner,hash,timestamp-86400);
    if(!row)error('Ya has publicado ese contenido recientemente.',409);
    return json({...row,status},201);
  }
  if(resource==='comments'&&!id){
    await throttle('c:'+owner,20,600);
    const post=positive(data.post), parent=positive(data.parent), content=field(data.body,2000,2);
    const status=settings.review?'pending':'public';
    const row=await first(`INSERT INTO comments(post,parent,depth,owner,body,status,created)
      SELECT p.id,?,coalesce(c.depth+1,0),?,?,?,? FROM posts p
      JOIN categories k ON k.id=p.category LEFT JOIN comments c ON c.id=? AND c.post=p.id AND c.status IN ('public','deleted') AND c.depth<3
      WHERE p.id=? AND p.status='public' AND p.closed=0 AND k.hidden=0 AND (? IS NULL OR c.id IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM comments d WHERE d.owner=? AND d.post=p.id AND d.body=? AND d.created>?) RETURNING id`,
      parent,owner,content,status,timestamp,parent,post,parent,owner,content,timestamp-600);
    if(!row)error('El debate está cerrado, la respuesta está duplicada o el hilo alcanzó el límite.',409);
    return json({...row,status},201);
  }
  if(['posts','comments'].includes(resource)&&target&&['edit','delete'].includes(action)){
    await throttle('edit:'+owner,20,600);
    const table=resource, max=table==='posts'?5000:2000;
    const removal=action==='delete';
    const fields=removal?"body='',status='deleted'"+(table==='posts'?",title='[Publicación eliminada]',tags='[]',config=NULL":""):
      'body=?'+(table==='posts'?',title=?':'')+(settings.review?",status='pending'":"");
    const args=removal?[]:[field(data.body,max,2),...(table==='posts'?[field(data.title,150,4)]:[])];
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

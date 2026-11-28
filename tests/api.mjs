import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {onRequest} from '../functions/api/[[path]].js';

const dir=mkdtempSync(join(tmpdir(),'ally-community-'));
const filename=join(dir,'test.sqlite');
let db=new DatabaseSync(filename);
db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0002_profiles.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0003_votes_likes_index.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0004_post_unique_views.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0005_device_access.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0006_recent_comments_index.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0007_photos.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0008_admin_notifications.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0009_ally_bot.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0010_presence.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0011_friends.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0012_social_notifications.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0013_social_features.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0014_lab_account.sql',import.meta.url),'utf8'));
const env={
  TURNSTILE_SITE_KEY:'test-site-key',TURNSTILE_SECRET:'test-secret',
  RATE_SECRET:'r'.repeat(64),ADMIN_TOKEN:'a'.repeat(64),
  DB:{
    prepare(text){
      return {bind(...args){
        function query(){return db.prepare(text);}
        return {
          async first(){return query().get(...args)??null;},
          async all(){return {results:query().all(...args)};},
          async run(){return query().run(...args);}
        };
      }};
    },
    async batch(items){
      db.exec('BEGIN');
      try{for(const item of items)await item.run();db.exec('COMMIT');}
      catch(error){db.exec('ROLLBACK');throw error;}
    }
  }
};
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  return Response.json({success:options.body.get('response')==='local-test',hostname:'community.test',action:'community_session'});
};
async function req(path,{data,cookie,key,origin='https://community.test',status=200,overrides={}}={}){
  const headers={Origin:origin,'CF-Connecting-IP':'192.0.2.10','Content-Type':'application/json'};
  if(cookie)headers.Cookie=cookie;
  if(key)headers.Authorization='Bearer '+key;
  const request=new Request('https://community.test/api/'+path,{headers,...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
  const response=await onRequest({request,env:{...env,...overrides}});
  const result=await response.json();
  assert.equal(response.status,status,path+' '+JSON.stringify(result));
  return {result,cookie:response.headers.get('set-cookie')};
}
try{
  assert.equal((await req('meta')).result.categories.length,15);
  await req('session',{data:{token:'invalid'},status:403});
  const session=await req('session',{data:{token:'local-test'},status:201});
  assert.match(session.cookie,/Secure; HttpOnly; SameSite=Lax/);
  const anon=session.cookie.split(';')[0];
  const anonB=(await req('session',{data:{token:'local-test'},status:201})).cookie.split(';')[0];
  const pa=await req('profile',{cookie:anon,data:{username:'TestGamer'},status:201});
  const a=pa.cookie.split(';')[0];
  await req('profile',{cookie:anonB,data:{username:'testgamer'},status:409});
  const pb=await req('profile',{cookie:anonB,data:{username:'OtherGamer'},status:201});
  const b=pb.cookie.split(';')[0];
  assert.notEqual(a,b);
  assert.equal((await req('meta',{cookie:a})).result.profile.username,'TestGamer');
  assert.equal((await req('meta',{cookie:anon})).result.session,false);
  await req('profile/claim-admin',{cookie:a,data:{},status:401});
  await req('profile/claim-admin',{cookie:a,key:env.ADMIN_TOKEN,data:{}});
  assert.equal((await req('meta',{cookie:a})).result.profile.role,'admin');
  await req('profile/claim-admin',{cookie:b,key:env.ADMIN_TOKEN,data:{},status:409});
  const anonC=(await req('session',{data:{token:'local-test'},status:201})).cookie.split(';')[0];
  const recovery=await req('profile/recover',{cookie:anonC,data:{code:pa.result.recovery}});
  assert.equal((await req('meta',{cookie:recovery.cookie.split(';')[0]})).result.profile.username,'TestGamer');
  // Un usuario ya identificado genera en su dispositivo una clave independiente
  // del código de recuperación (que sigue funcionando).
  assert.equal((await req('profile',{cookie:a})).result.deviceKeyEnabled,false);
  await req('profile/device-key',{data:{},status:401});
  await req('profile/device-key',{cookie:anonC,data:{},status:401});
  const firstDeviceKey=(await req('profile/device-key',{cookie:a,data:{}})).result.key;
  assert.match(firstDeviceKey,/^[a-f0-9]{64}$/);
  assert.equal((await req('profile',{cookie:a})).result.deviceKeyEnabled,true);
  const storedHash=db.prepare('SELECT device_key_hash FROM profiles WHERE username=?').get('TestGamer').device_key_hash;
  assert.match(storedHash,/^[a-f0-9]{64}$/);
  assert.notEqual(storedHash,firstDeviceKey);
  const anonD=(await req('session',{data:{token:'local-test'},status:201})).cookie.split(';')[0];
  await req('profile/device-login',{cookie:anonD,data:{username:'TestGamer',key:'f'.repeat(64)},status:401});
  await req('profile/device-login',{cookie:anonD,data:{username:'NoExiste',key:firstDeviceKey},status:401});
  await req('profile/device-login',{cookie:anonD,origin:'https://outside.test',data:{username:'TestGamer',key:firstDeviceKey},status:403});
  const linked=await req('profile/device-login',{cookie:anonD,data:{username:'testgamer',key:firstDeviceKey}});
  assert.match(linked.cookie,/Secure; HttpOnly; SameSite=Lax/);
  const newDevice=linked.cookie.split(';')[0];
  const linkedProfile=(await req('meta',{cookie:newDevice})).result.profile;
  assert.equal(linkedProfile.username,'TestGamer');
  assert.equal(linkedProfile.role,'admin');
  // La clave puede renovarse: la antigua deja de funcionar, sin cerrar
  // otras sesiones previamente abiertas ni eliminar publicaciones.
  const secondDeviceKey=(await req('profile/device-key',{cookie:a,data:{}})).result.key;
  assert.notEqual(secondDeviceKey,firstDeviceKey);
  assert.equal((await req('meta',{cookie:newDevice})).result.profile.username,'TestGamer');
  const anonE=(await req('session',{data:{token:'local-test'},status:201})).cookie.split(';')[0];
  await req('profile/device-login',{cookie:anonE,data:{username:'TestGamer',key:firstDeviceKey},status:401});
  const relinked=await req('profile/device-login',{cookie:anonE,data:{username:'TestGamer',key:secondDeviceKey}});
  assert.equal((await req('meta',{cookie:relinked.cookie.split(';')[0]})).result.profile.role,'admin');
  // El código de recuperación anterior no se modifica al crear la nueva clave.
  const anonF=(await req('session',{data:{token:'local-test'},status:201})).cookie.split(';')[0];
  const legacyRecovery=await req('profile/recover',{cookie:anonF,data:{code:pa.result.recovery}});
  assert.equal((await req('meta',{cookie:legacyRecovery.cookie.split(';')[0]})).result.profile.username,'TestGamer');

  const draft={title:'Ajustes de Cyberpunk',category:4,body:'Prueba de rendimiento <i>literal</i>.',game:'cyberpunk-2077-rog-xbox-ally-x',config:{model:'Xbox ROG Ally X',resolution:'900p',fps:'60 FPS',notes:'No exponer en benchmark'}};
  await req('posts',{data:draft,status:401});
  await req('posts',{cookie:a,data:draft,origin:'https://irrelevant.test',status:403});
  const post=(await req('posts',{cookie:a,data:draft,status:201})).result.id;
  await req('posts',{cookie:a,data:draft,status:409});
  const searchResult=await req('public-search?q=cyberpunk');
  assert.equal(searchResult.result.rows[0].id,post);
  assert.ok(!('owner' in searchResult.result.rows[0]));
  assert.deepEqual((await req('public-search?q=zzinexistente')).result.rows,[]);
  const publicBench=await req('benchmarks?game=cyberpunk-2077-rog-xbox-ally-x');
  assert.equal(publicBench.result.rows.length,1);
  assert.equal(publicBench.result.rows[0].fps,60);
  assert.equal(publicBench.result.rows[0].id,post);
  assert.ok(!('notes' in publicBench.result.rows[0]));
  assert.ok(!('username' in publicBench.result.rows[0]));
  assert.deepEqual((await req('benchmarks?game=otro-juego')).result.rows,[]);
  await req('benchmarks?game=INVALID!',{status:400});
  db.close();db=new DatabaseSync(filename);
  const detail=(await req('posts/'+post,{cookie:a})).result;
  assert.equal(detail.own,1);assert.equal(detail.username,'TestGamer');assert.equal(detail.role,'admin');assert.equal(JSON.parse(detail.config).resolution,'900p');
  // Las lecturas GET no inflan el contador: se registra solo al abrir el hilo.
  assert.equal(detail.views,0);
  assert.equal((await req('posts/'+post)).result.views,0);
  await req('visits',{data:{post},origin:'https://third-party.test',status:403});
  await req('visits',{data:{post:-1},status:400});
  await req('visits',{data:{post:987654},status:404});
  const firstView=await req('visits',{data:{post}});
  assert.equal(firstView.result.views,1);
  assert.match(firstView.cookie,/__Host-ally_visitor=[a-f0-9]{64}/);
  assert.match(firstView.cookie,/Secure; HttpOnly; SameSite=Lax/);
  const guestCookie=firstView.cookie.split(';')[0];
  const repeated=await req('visits',{data:{post},cookie:guestCookie});
  assert.equal(repeated.result.views,1);
  assert.equal(repeated.cookie,null);
  assert.equal((await req('visits',{data:{post}})).result.views,2); // Otro navegador sin cookie
  assert.equal((await req('visits',{data:{post},cookie:a})).result.views,3);
  assert.equal((await req('visits',{data:{post},cookie:recovery.cookie.split(';')[0]})).result.views,3); // Mismo perfil en otro dispositivo
  assert.equal((await req('visits',{data:{post},cookie:b})).result.views,4);
  assert.equal((await req('visits',{data:{post},cookie:b})).result.views,4);
  assert.equal((await req('posts/'+post)).result.views,4);
  assert.equal((await req('posts?sort=views')).result.rows[0].views,4);
  assert.equal((await req('stats')).result.mostVisited[0].views,4);
  assert.equal((await req('stats')).result.totals.uniqueViews,4);

  assert.equal((await req('posts?q=cyberpunk')).result.rows[0].id,post);
  assert.equal((await req('posts?game='+draft.game)).result.rows[0].id,post);
  await req('posts/'+post+'/edit',{cookie:b,data:{title:'Otro título',body:'Texto nuevo'},status:404});
  await req('posts/'+post+'/edit',{cookie:a,data:{title:'Ajustes nuevos',body:'Texto nuevo'}});
  const comment=(await req('comments',{cookie:b,data:{post,body:'He probado los ajustes.'},status:201})).result.id;
  const replyId=(await req('comments',{cookie:a,data:{post,parent:comment,body:'Gracias por la prueba.'},status:201})).result.id;
  await req('profile/public-details',{cookie:a,data:{avatar:'🎮',color:'green',bio:'Pruebas de juegos',model:'Xbox ROG Ally X'}});
  const member=(await req('member/TestGamer')).result.profile;
  assert.equal(member.bio,'Pruebas de juegos');assert.equal(member.rank,'Administrador');assert.ok(!('owner' in member));
  await req('thread-tools/'+post+'/solution',{cookie:b,data:{comment},status:403});
  await req('thread-tools/'+post+'/solution',{cookie:a,data:{comment}});
  assert.equal((await req('thread-tools/'+post)).result.solution.id,comment);
  await req('thread-tools/'+post+'/solution',{cookie:a,data:{comment:null}});
  await req('thread-tools/'+post+'/poll',{cookie:b,data:{options:['Uno','Dos']},status:403});
  await req('thread-tools/'+post+'/poll',{cookie:a,data:{options:['Uno','Dos']},status:201});
  await req('thread-tools/'+post+'/vote',{cookie:b,data:{choice:1}});
  await req('thread-tools/'+post+'/vote',{cookie:b,data:{choice:0}});
  assert.deepEqual((await req('thread-tools/'+post,{cookie:b})).result.poll.counts,[1,0]);
  await req('thread-tools/'+post+'/follow',{cookie:b,data:{enabled:true}});
  assert.equal((await req('thread-tools/'+post,{cookie:b})).result.following,true);
  await req('thread-tools/'+post+'/follow',{cookie:b,data:{enabled:false}});

  const firstPreview=(await req('posts?')).result.rows.find(row=>row.id===post).latestComments;
  assert.equal(firstPreview.length,2);
  assert.deepEqual(firstPreview.map(item=>item.id),[replyId,comment]);
  assert.equal(firstPreview[0].body,'Gracias por la prueba.');
  assert.equal(firstPreview[0].username,'TestGamer');
  assert.equal(firstPreview[0].role,'admin');
  assert.ok(firstPreview[0].created>0);
  assert.equal(firstPreview[0].post,post);
  assert.equal((await req('posts/'+post)).result.latestComments,undefined);
  assert.equal((await req('comments?post='+post+'&parent='+comment)).result.rows[0].author,1);
  assert.equal((await req('notices',{cookie:b})).result.rows.length,1);
  // Solo aparecen los dos más recientes, incluyendo respuestas anidadas,
  // con recorte de textos gigantes en la API de portada.
  const mediumText='Comentario mediano '+ 'm'.repeat(240);
  const largeText='Comentario demasiado largo '+ 'L'.repeat(1550);
  const mediumId=(await req('comments',{cookie:b,data:{post,body:mediumText},status:201})).result.id;
  const largeId=(await req('comments',{cookie:a,data:{post,body:largeText},status:201})).result.id;
  const recent=(await req('posts?sort=views')).result.rows.find(row=>row.id===post).latestComments;
  assert.deepEqual(recent.map(item=>item.id),[largeId,mediumId]);
  assert.equal(recent[0].bodyLength,largeText.length);
  assert.equal(recent[0].body.length,601);
  assert.equal(recent[1].bodyLength,mediumText.length);
  assert.equal(recent[1].body,mediumText);
  assert.equal(recent[1].username,'OtherGamer');
  const limitedPage=(await req('posts?after=0:999999:999999')).result.rows;
  assert.ok(Array.isArray(limitedPage[0]?.latestComments));
  await req('comments/'+comment+'/edit',{cookie:b,data:{body:'Comentario corregido'}});
  assert.equal((await req('comments?post='+post,{cookie:a})).result.rows.find(item=>item.id===comment).likes,0);
  await req('vote',{cookie:a,data:{kind:'comment',target:comment,value:1}});
  assert.equal((await req('comments?post='+post,{cookie:a})).result.rows.find(item=>item.id===comment).likes,1);
  await req('vote',{cookie:a,data:{kind:'comment',target:comment,value:0}});
  assert.equal((await req('comments?post='+post,{cookie:a})).result.rows.find(item=>item.id===comment).likes,0);
  await req('comments/'+comment+'/delete',{cookie:b,data:{}});
  assert.equal((await req('comments?post='+post)).result.rows.find(item=>item.id===comment).status,'deleted');
  assert.equal((await req('posts/'+post)).result.likes,0);
  assert.equal((await req('posts?')).result.rows[0].likes,0);
  for(const [value,score,likes] of [[1,1,1],[1,1,1],[-1,-1,0],[0,0,0]]){
    await req('vote',{cookie:b,data:{kind:'post',target:post,value}});
    const current=(await req('posts/'+post)).result;
    assert.equal(current.score,score);
    assert.equal(current.likes,likes);
  }
  await req('vote',{cookie:a,data:{kind:'post',target:post,value:1}});
  await req('vote',{cookie:b,data:{kind:'post',target:post,value:-1}});
  assert.equal((await req('posts/'+post)).result.score,0);
  assert.equal((await req('posts/'+post)).result.likes,1);
  await req('vote',{cookie:a,data:{kind:'post',target:post,value:0}});
  await req('vote',{cookie:b,data:{kind:'post',target:post,value:0}});
  assert.equal((await req('posts/'+post)).result.likes,0);
  await req('report',{cookie:b,data:{kind:'post',target:post,reason:'spam'},status:201});
  await req('admin',{status:401});
  const admin=(await req('admin',{key:env.ADMIN_TOKEN})).result;
  assert.equal(admin.reports.length,1);
  // El comentario oculto nunca se muestra en portada.
  await req('admin/comment',{key:env.ADMIN_TOKEN,data:{id:largeId,status:'hidden'}});
  const afterHide=(await req('posts?')).result.rows.find(row=>row.id===post).latestComments;
  assert.deepEqual(afterHide.map(item=>item.id),[mediumId,replyId]);
  assert.ok(!afterHide.some(item=>item.id===comment)); // Comentario eliminado anteriormente
  await req('admin/settings',{key:env.ADMIN_TOKEN,data:{readonly:true}});
  await req('comments',{cookie:b,data:{post,body:'Comprobación de cierre'},status:403});
  await req('admin/settings',{key:env.ADMIN_TOKEN,data:{readonly:false,review:true}});
  const pendingComment=(await req('comments',{cookie:b,data:{post,body:'Esta respuesta no debe aparecer en portada.'},status:201})).result;
  assert.equal(pendingComment.status,'pending');
  assert.ok(!(await req('posts?')).result.rows.find(row=>row.id===post).latestComments.some(item=>item.id===pendingComment.id));
  const debate={category:2,title:'Debate de Cyberpunk',body:'Hilo de Cyberpunk',game:draft.game,debate:true};
  const pending=(await req('posts',{cookie:a,data:debate,status:201})).result;
  await req('posts',{cookie:b,data:debate,status:409});
  await req('posts/'+pending.id,{status:404});
  await req('admin/post',{key:env.ADMIN_TOKEN,data:{id:pending.id,status:'public'}});
  assert.equal((await req('posts',{cookie:b,data:debate})).result.id,pending.id);
  await req('posts/'+post+'/delete',{cookie:a,data:{}});
  await req('posts/'+post,{status:404});
  await req('visits',{data:{post},cookie:guestCookie,status:404});
  const limited={kind:'post',target:pending.id,value:1};
  for(let i=0;i<24;i++)await req('vote',{cookie:b,data:limited});
  await req('vote',{cookie:b,data:limited,status:429});
  assert.equal((await req('posts/'+pending.id)).result.score,1);
  await req('admin/settings',{key:env.ADMIN_TOKEN,data:{readonly:false,review:false}});
  const photo='UklGRjAAAABXRUJQVlA4ICQAAACQAQCdASoQABAAAUAmJQBOl0AAcwAA/vPfZrQtCBz15T4laAA=';
  await req('posts',{cookie:a,data:{category:2,title:'Foto no válida',body:'',photos:['not-an-image']},status:400});
  const photoPost=(await req('posts',{cookie:a,data:{category:2,title:'Captura de pantalla',body:'',photos:[photo]},status:201})).result.id;
  assert.equal((await req('posts/'+photoPost)).result.photoCount,1);
  const photoComment=(await req('comments',{cookie:a,data:{post:photoPost,body:'',photos:[photo,photo]},status:201})).result.id;
  assert.equal((await req('comments?post='+photoPost)).result.rows[0].photoCount,2);
  const getPhoto=async(path,key)=>onRequest({request:new Request('https://community.test/api/'+path,{headers:key?{Authorization:'Bearer '+key}:{}}),env});
  let image=await getPhoto('photos/post/'+photoPost);
  assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/webp');
  assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'),photo);
  assert.equal((await getPhoto('photos/comment/'+photoComment+'?index=1')).status,200);
  await req('admin/post',{key:env.ADMIN_TOKEN,data:{id:photoPost,status:'hidden'}});
  assert.equal((await getPhoto('photos/post/'+photoPost)).status,404);
  assert.equal((await getPhoto('photos/comment/'+photoComment)).status,404);
  assert.equal((await getPhoto('photos/post/'+photoPost,env.ADMIN_TOKEN)).status,200);
  await req('admin/post',{key:env.ADMIN_TOKEN,data:{id:photoPost,status:'public'}});
  await req('posts/'+photoPost+'/edit',{cookie:a,data:{title:'Captura editada',body:'Sin fotos',photos:[]}});
  assert.equal((await getPhoto('photos/post/'+photoPost)).status,404);
  await req('comments/'+photoComment+'/delete',{cookie:a,data:{}});
  assert.equal((await getPhoto('photos/comment/'+photoComment)).status,404);
  assert.equal(db.prepare('SELECT bytes FROM photo_budget WHERE id=1').get().bytes,0);
  // Solo el perfil admin autenticado puede leer y marcar sus informes.
  const adminOwner=db.prepare("SELECT owner FROM profiles WHERE role='admin'").get().owner;
  db.prepare('INSERT INTO admin_notifications(owner,delivery_key,title,message) VALUES(?,?,?,?)').run(adminOwner,'test-log','Informe privado','Caso de prueba');
  await req('admin-notices',{status:403});
  await req('admin-notices',{cookie:b,status:403});
  await req('admin-notices?count=1',{cookie:b,status:403});
  const adminLogs=(await req('admin-notices',{cookie:a})).result;
  assert.equal(adminLogs.rows.length,1);assert.equal(adminLogs.rows[0].title,'Informe privado');assert.equal(adminLogs.unread,1);
  assert.equal((await req('admin-notices?count=1',{cookie:a})).result.unread,1);
  await req('admin-notices/read',{cookie:b,data:{through:adminLogs.rows[0].id},status:403});
  await req('admin-notices/read',{cookie:a,origin:'https://third-party.test',data:{through:adminLogs.rows[0].id},status:403});
  assert.equal((await req('admin-notices/read',{cookie:a,data:{through:adminLogs.rows[0].id}})).result.unread,0);
  assert.equal((await req('admin-notices',{cookie:a})).result.rows.length,1);
  assert.ok((await req('admin-notices',{cookie:a})).result.rows[0].read_at);
  assert.ok(!(await req('notices',{cookie:b})).result.rows.some(x=>x.message==='Caso de prueba'));
  const allyProfile=db.prepare("SELECT owner,role FROM profiles WHERE username='Ally'").get();
  assert.equal(allyProfile.role,'member');
  assert.throws(()=>db.prepare('INSERT INTO profile_devices(id,owner,expires) VALUES(?,?,?)').run('f'.repeat(64),allyProfile.owner,253402300799),/ally_service_identity/);
  const botPost=(await req('posts',{cookie:a,data:{category:2,title:'Consulta para Ally',body:'¿Algún consejo? [sticker:saludo]'},status:201})).result.id;
  const addBot=db.prepare("INSERT INTO ally_bot_replies(kind,target,post_id,response) VALUES('post',?,?,?)");
  addBot.run(botPost,botPost,'¡Hola! ¿Qué juego estás probando? [sticker:ayuda]');
  const botRow=(await req('comments?post='+botPost)).result.rows[0];
  assert.equal(botRow.username,'Ally');assert.equal(botRow.role,'member');assert.match(botRow.body,/sticker:ayuda/);
  assert.equal((await req('posts/'+botPost)).result.replies,1);
  assert.throws(()=>addBot.run(botPost,botPost,'Otra respuesta'),/UNIQUE/);
  assert.equal(db.prepare('SELECT comment_id FROM ally_bot_replies WHERE target=?').get(botPost).comment_id,botRow.id);
  await req('admin/ally-bot',{cookie:b,data:{enabled:false},status:401});
  await req('admin/ally-bot',{key:env.ADMIN_TOKEN,data:{enabled:false}});
  const otherPost=(await req('posts',{cookie:b,data:{category:2,title:'Otro tema para Ally',body:'Texto de prueba'},status:201})).result.id;
  assert.throws(()=>addBot.run(otherPost,otherPost,'Respuesta no autorizada'),/ally_reply_not_allowed/);
  await req('admin/ally-bot',{key:env.ADMIN_TOKEN,data:{enabled:true}});
  assert.equal((await req('meta',{cookie:a})).result.presenceSharing,null);
  assert.deepEqual((await req('presence',{cookie:a,data:{names:['TestGamer'],heartbeat:true}})).result.online,[]);
  await req('presence/preference',{data:{enabled:true},status:401});
  await req('presence/preference',{cookie:a,data:{enabled:true}});
  assert.equal((await req('meta',{cookie:a})).result.presenceSharing,1);
  assert.deepEqual((await req('presence',{cookie:a,data:{names:['TestGamer'],heartbeat:true}})).result.online,['TestGamer']);
  assert.deepEqual((await req('presence',{cookie:b,data:{names:['testgamer','OtherGamer','Ally']}})).result.online,['TestGamer']);
  assert.deepEqual((await req('presence',{data:{names:['TestGamer']}})).result.online,['TestGamer']);
  await req('presence',{data:{names:Array(81).fill('TestGamer')},status:400});
  await req('presence',{data:{names:['x OR 1=1']},status:400});
  await req('presence',{cookie:a,origin:'https://third-party.test',data:{names:[],heartbeat:true},status:403});
  db.prepare('UPDATE profile_presence SET expires=unixepoch()-1').run();
  assert.deepEqual((await req('presence',{cookie:b,data:{names:['TestGamer']}})).result.online,[]);
  await req('presence',{cookie:a,data:{names:[],heartbeat:true}});
  await req('presence/preference',{cookie:a,data:{enabled:false}});
  assert.equal(db.prepare('SELECT count(*) AS n FROM profile_presence').get().n,0);
  assert.deepEqual((await req('presence',{cookie:a,data:{names:['TestGamer'],heartbeat:true}})).result.online,[]);
  // Private social access: only a confirmed pair may read or send.
  await req('friends',{status:401});
  await req('friends/request',{cookie:a,data:{username:'Ally'},status:404});
  await req('friends/request',{cookie:a,data:{username:'OtherGamer'},status:201});
  const incoming=(await req('friends',{cookie:b})).result.rows[0];
  assert.equal(incoming.username,'TestGamer');assert.equal(incoming.outgoing,false);assert.equal(incoming.accepted,false);
  assert.equal((await req('friends/summary',{cookie:b})).result.requests,1);
  assert.equal((await req('friends/notifications',{cookie:b})).result.requests[0].username,'TestGamer');
  assert.equal((await req('friends/notifications',{cookie:a})).result.requests.length,0);
  await req('friends/notifications',{status:401});
  await req('chat/'+incoming.id,{cookie:a,status:404});
  await req('friends/accept',{cookie:a,data:{username:'OtherGamer'},status:404});
  await req('friends/accept',{cookie:b,data:{username:'TestGamer',requestId:incoming.id+1},status:404});
  await req('friends/accept',{cookie:b,data:{username:'TestGamer',requestId:incoming.id}});
  const acceptedNotice=(await req('friends/notifications',{cookie:a})).result.outcomes[0];
  assert.equal(acceptedNotice.kind,'accepted');assert.equal(acceptedNotice.username,'OtherGamer');assert.equal(acceptedNotice.chatId,incoming.id);
  assert.equal((await req('friends/notifications',{cookie:b})).result.requests.length,0);
  await req('friends/notifications-read',{cookie:b,data:{through:acceptedNotice.id}});
  assert.equal((await req('friends/summary',{cookie:a})).result.outcomes,1);
  await req('friends/notifications-read',{cookie:a,data:{through:acceptedNotice.id}});
  assert.equal((await req('friends/summary',{cookie:a})).result.outcomes,0);
  await req('chat/'+incoming.id,{status:401});
  await req('chat/'+incoming.id+'/send',{cookie:a,origin:'https://third-party.test',data:{body:'Hola'},status:403});
  const sent=(await req('chat/'+incoming.id+'/send',{cookie:a,data:{body:'Hola, amigo'},status:201})).result.id;
  assert.equal((await req('friends/summary',{cookie:b})).result.unread,1);
  const chatNotice=(await req('friends/notifications',{cookie:b})).result.chats[0];
  assert.equal(chatNotice.username,'TestGamer');assert.equal(chatNotice.id,incoming.id);assert.equal(chatNotice.unread,1);assert.ok(!('body' in chatNotice));
  assert.equal((await req('friends/notifications',{cookie:a})).result.chats.length,0);
  // A third, authenticated user cannot read, send or mark messages in this chat.
  const thirdOwner='d'.repeat(64),thirdKey='c'.repeat(64);
  const thirdCredential=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(thirdKey))),v=>v.toString(16).padStart(2,'0')).join('');
  db.prepare('INSERT INTO sessions(id,expires) VALUES(?,?)').run(thirdOwner,253402300799);
  db.prepare('INSERT INTO profiles(owner,username,recovery_hash,created) VALUES(?,?,?,?)').run(thirdOwner,'ThirdGamer','e'.repeat(64),Math.floor(Date.now()/1000));
  db.prepare('INSERT INTO profile_devices(id,owner,expires) VALUES(?,?,?)').run(thirdCredential,thirdOwner,253402300799);
  const thirdCookie='__Host-ally_session='+thirdKey;
  const outsider=(await req('friends/notifications',{cookie:thirdCookie})).result;assert.deepEqual(outsider.chats,[]);assert.deepEqual(outsider.outcomes,[]);assert.deepEqual(outsider.requests,[]);
  await req('chat/'+incoming.id,{cookie:thirdCookie,status:404});
  await req('chat/'+incoming.id+'/send',{cookie:thirdCookie,data:{body:'Intruso'},status:404});
  await req('chat/'+incoming.id+'/read',{cookie:thirdCookie,data:{ids:[sent]},status:404});
  await req('chat/'+incoming.id,{cookie:thirdCookie,key:env.ADMIN_TOKEN,status:404});
  const received=(await req('chat/'+incoming.id,{cookie:b})).result.rows[0];
  assert.equal(received.body,'Hola, amigo');assert.equal(received.own,0);
  assert.ok(!('sender' in received));
  const later=(await req('chat/'+incoming.id+'/send',{cookie:a,data:{body:'Segundo mensaje'},status:201})).result;
  assert.ok(Number.isInteger(later.created));
  await req('chat/'+incoming.id+'/read',{cookie:b,data:{ids:[later.id]}});
  const both=(await req('chat/'+incoming.id,{cookie:b})).result.rows;
  assert.deepEqual(both.map(r=>[r.id,r.read]),[[sent,0],[later.id,1]]);
  assert.equal((await req('friends/summary',{cookie:b})).result.unread,1);
  await req('chat/'+incoming.id+'/read',{cookie:b,data:{ids:[sent]}});
  assert.equal((await req('friends/summary',{cookie:b})).result.unread,0);
  assert.equal((await req('friends/notifications',{cookie:b})).result.chats.length,0);
  assert.equal((await req('chat/'+incoming.id,{cookie:a})).result.rows[0].read,1);
  await req('friends/privacy',{cookie:a,data:{enabled:true},status:400});
  await req('presence/preference',{cookie:a,data:{enabled:true}});
  await req('friends/privacy',{cookie:a,data:{enabled:true}});
  await req('presence',{cookie:a,data:{names:[],heartbeat:true}});
  assert.equal((await req('friends',{cookie:b})).result.rows[0].online,true);
  db.prepare('UPDATE profile_presence SET expires=unixepoch()-1').run();
  db.prepare('UPDATE friend_activity SET last_active=unixepoch()-600').run();
  assert.equal((await req('friends',{cookie:b})).result.rows[0].lastSeen,'Hace 10 min');
  await req('friends/privacy',{cookie:a,data:{enabled:false}});
  assert.equal((await req('friends',{cookie:b})).result.rows[0].lastSeen,null);
  db.prepare('UPDATE private_messages SET created=unixepoch()-2592001').run();
  assert.deepEqual((await req('chat/'+incoming.id,{cookie:b})).result.rows,[]);
  await req('friends/block',{cookie:b,data:{username:'TestGamer'}});
  await req('chat/'+incoming.id,{cookie:a,status:404});
  await req('chat/'+incoming.id+'/send',{cookie:a,data:{body:'No'},status:404});
  assert.equal(db.prepare('SELECT count(*) AS n FROM private_messages').get().n,0);
  await req('friends/request',{cookie:a,data:{username:'OtherGamer'},status:404});
  await req('friends/unblock',{cookie:b,data:{username:'TestGamer'}});
  await req('friends/request',{cookie:a,data:{username:'OtherGamer'},status:201});
  await req('friends/decline',{cookie:b,data:{username:'TestGamer'}});
  assert.deepEqual((await req('friends',{cookie:b})).result.rows,[]);
  assert.equal((await req('friends/notifications',{cookie:a})).result.outcomes[0].kind,'declined');
  await req('friends/request',{cookie:a,data:{username:'OtherGamer'},status:201});
  await req('friends/decline',{cookie:a,data:{username:'OtherGamer'},status:404});
  await req('friends/cancel',{cookie:b,data:{username:'TestGamer'},status:404});
  await req('friends/cancel',{cookie:a,data:{username:'OtherGamer'}});
  assert.equal((await req('friends/notifications',{cookie:a})).result.outcomes.length,2);
  assert.equal((await req('friends/notifications',{cookie:b})).result.outcomes.length,0);
  // Revocar otras sesiones conserva la actual y no afecta a perfiles ajenos.
  assert.ok((await req('profile',{cookie:a})).result.activeDevices>=4);
  // Server-to-server exchange: state-bound, single use and scoped to favorites.
  const linkState='a'.repeat(64);
  const grant=(await req('lab-link/authorize',{cookie:a,data:{state:linkState}})).result.code;
  async function labRequest(action,token,data,expected=200){
    const response=await onRequest({request:new Request('https://community.test/api/lab-link/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data)}),env});
    const result=await response.json();assert.equal(response.status,expected,action+' '+JSON.stringify(result));return result;
  }
  await labRequest('redeem',grant,{state:'b'.repeat(64)},401);
  const labSession=(await labRequest('redeem',grant,{state:linkState})).token;
  await labRequest('redeem',grant,{state:linkState},401);
  assert.equal((await labRequest('state',labSession,{})).username,'TestGamer');
  assert.deepEqual((await labRequest('merge',labSession,{games:['cyberpunk','doom']})).favorites,['cyberpunk','doom']);
  assert.deepEqual((await labRequest('favorite',labSession,{game:'doom',enabled:false})).favorites,['cyberpunk']);
  const bGrant=(await req('lab-link/authorize',{cookie:b,data:{state:linkState}})).result.code;
  const bLink=(await labRequest('redeem',bGrant,{state:linkState})).token;
  assert.deepEqual((await labRequest('state',bLink,{})).favorites,[]);
  await req('lab-link/revoke',{cookie:a,data:{}});
  await labRequest('state',labSession,{},401);
  assert.equal((await labRequest('state',bLink,{})).username,'OtherGamer');
  await labRequest('logout',bLink,{});
  await labRequest('state',bLink,{},401);
  await req('profile/revoke-other-devices',{cookie:anonC,data:{},status:401});
  await req('profile/revoke-other-devices',{cookie:a,origin:'https://third-party.test',data:{},status:403});
  await req('profile/revoke-other-devices',{cookie:a,data:{}});
  assert.equal((await req('profile',{cookie:a})).result.activeDevices,1);
  assert.equal((await req('meta',{cookie:newDevice})).result.profile,null);
  assert.equal((await req('meta',{cookie:b})).result.profile.username,'OtherGamer');

  await req('posts',{overrides:{DB:null},status:503});
  console.log('SQLite persistente, dos sesiones, debate, configuración, comentarios, votos, denuncias, moderación y fallos: OK');
}finally{
  globalThis.fetch=original;db.close();rmSync(dir,{recursive:true,force:true});
}

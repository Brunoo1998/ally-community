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
  const draft={title:'Ajustes de Cyberpunk',category:4,body:'Prueba de rendimiento <i>literal</i>.',game:'cyberpunk-2077-rog-xbox-ally-x',config:{model:'Xbox ROG Ally X',resolution:'900p'}};
  await req('posts',{data:draft,status:401});
  await req('posts',{cookie:a,data:draft,origin:'https://irrelevant.test',status:403});
  const post=(await req('posts',{cookie:a,data:draft,status:201})).result.id;
  await req('posts',{cookie:a,data:draft,status:409});
  db.close();db=new DatabaseSync(filename);
  const detail=(await req('posts/'+post,{cookie:a})).result;
  assert.equal(detail.own,1);assert.equal(detail.username,'TestGamer');assert.equal(detail.role,'admin');assert.equal(JSON.parse(detail.config).resolution,'900p');
  assert.equal((await req('posts?q=cyberpunk')).result.rows[0].id,post);
  assert.equal((await req('posts?game='+draft.game)).result.rows[0].id,post);
  await req('posts/'+post+'/edit',{cookie:b,data:{title:'Otro título',body:'Texto nuevo'},status:404});
  await req('posts/'+post+'/edit',{cookie:a,data:{title:'Ajustes nuevos',body:'Texto nuevo'}});
  const comment=(await req('comments',{cookie:b,data:{post,body:'He probado los ajustes.'},status:201})).result.id;
  await req('comments',{cookie:a,data:{post,parent:comment,body:'Gracias por la prueba.'},status:201});
  assert.equal((await req('comments?post='+post+'&parent='+comment)).result.rows[0].author,1);
  assert.equal((await req('notices',{cookie:b})).result.rows.length,1);
  await req('comments/'+comment+'/edit',{cookie:b,data:{body:'Comentario corregido'}});
  await req('comments/'+comment+'/delete',{cookie:b,data:{}});
  assert.equal((await req('comments?post='+post)).result.rows[0].status,'deleted');
  for(const [value,score] of [[1,1],[1,1],[-1,-1],[0,0]]){
    await req('vote',{cookie:b,data:{kind:'post',target:post,value}});
    assert.equal((await req('posts/'+post)).result.score,score);
  }
  await req('report',{cookie:b,data:{kind:'post',target:post,reason:'spam'},status:201});
  await req('admin',{status:401});
  const admin=(await req('admin',{key:env.ADMIN_TOKEN})).result;
  assert.equal(admin.reports.length,1);
  await req('admin/settings',{key:env.ADMIN_TOKEN,data:{readonly:true}});
  await req('comments',{cookie:b,data:{post,body:'Comprobación de cierre'},status:403});
  await req('admin/settings',{key:env.ADMIN_TOKEN,data:{readonly:false,review:true}});
  const debate={category:2,title:'Debate de Cyberpunk',body:'Hilo de Cyberpunk',game:draft.game,debate:true};
  const pending=(await req('posts',{cookie:a,data:debate,status:201})).result;
  await req('posts',{cookie:b,data:debate,status:409});
  await req('posts/'+pending.id,{status:404});
  await req('admin/post',{key:env.ADMIN_TOKEN,data:{id:pending.id,status:'public'}});
  assert.equal((await req('posts',{cookie:b,data:debate})).result.id,pending.id);
  await req('posts/'+post+'/delete',{cookie:a,data:{}});
  await req('posts/'+post,{status:404});
  const limited={kind:'post',target:pending.id,value:1};
  for(let i=0;i<26;i++)await req('vote',{cookie:b,data:limited});
  await req('vote',{cookie:b,data:limited,status:429});
  assert.equal((await req('posts/'+pending.id)).result.score,1);
  await req('posts',{overrides:{DB:null},status:503});
  console.log('SQLite persistente, dos sesiones, debate, configuración, comentarios, votos, denuncias, moderación y fallos: OK');
}finally{
  globalThis.fetch=original;db.close();rmSync(dir,{recursive:true,force:true});
}

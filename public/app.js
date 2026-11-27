import './gamepad.js';
const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search), requestedGame=params.get('game');
const game=/^[a-z0-9][a-z0-9-]{0,149}$/.test(requestedGame||'')?requestedGame:'';
const lab='https://ally-lab.pages.dev/';
const gameLink=id=>lab+'#juego/'+encodeURIComponent(id);
const modal=$('#modal'), content=$('#modal-body'), status=$('#status'), form=$('#filters');
const reasons=['spam','insultos','acoso','ilegal','datos personales','enlaces peligrosos','fuera de temática'];
const labels={version:'Versión del juego',model:'Modelo de ROG Ally',launcher:'Launcher o emulador',resolution:'Resolución',quality:'Calidad',fps:'FPS medios observados',tdp:'TDP',vram:'VRAM',scaling:'Reescalado',frameGeneration:'Frame Generation',power:'Corriente o batería',driver:'Controlador gráfico',stability:'Estabilidad',issues:'Problemas',notes:'Observaciones'};
let meta, turnstileScript, generation=0;
function el(tag,text,parent){
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  parent?.append(node);
  return node;
}
function button(parent,text,fn){
  const node=el('button',text,parent);
  node.type='button';
  node.onclick=()=>attempt(fn);
  return node;
}
function link(parent,text,href){const a=el('a',text,parent);a.href=href;return a;}
function input(parent,label,name,options={}){
  const wrap=el('label',label,parent), node=el(options.multiline?'textarea':'input',undefined,wrap);
  node.name=name;
  if(options.max)node.maxLength=options.max;
  node.value=options.value||'';
  node.required=!!options.required;
  return node;
}
function select(parent,label,name,values){
  const node=el('select',undefined,el('label',label,parent));node.name=name;
  for(const [value,text] of values)el('option',text,node).value=value;
  return node;
}
async function api(route,data,key){
  const headers={'Content-Type':'application/json'};if(key)headers.Authorization='Bearer '+key;
  const response=await fetch('/api/'+route,data===undefined?{}:{method:'POST',headers,body:JSON.stringify(data)});
  const result=await response.json().catch(()=>({error:'Servicio temporalmente no disponible.'}));
  if(!response.ok)throw Error(result.error||'No se pudo completar la operación.');
  return result;
}
async function attempt(callback){
  const feedback=modal.open?$('#modal-status'):status;
  try{feedback.textContent='';await callback();}
  catch(error){(modal.open?$('#modal-status'):status).textContent=error.message;}
}
function open(title){
  $('#modal-title').textContent=title;content.replaceChildren();$('#modal-status').textContent='';
  if(!modal.open)modal.showModal();
}
function renderText(parent,text){
  const box=el('div',undefined,parent);box.className='prose';
  const pattern=/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g;
  for(const part of String(text||'').split(pattern)){
    if(part.startsWith('**')&&part.endsWith('**')&&part.length>4)el('strong',part.slice(2,-2),box);
    else if(part.startsWith('`')&&part.endsWith('`')&&part.length>2)el('code',part.slice(1,-1),box);
    else{
      const found=part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
      if(found){
        try{
          const url=new URL(found[2]);
          if(url.protocol==='https:'&&!url.username&&!url.password){
            const a=link(box,found[1],url.href);a.rel='nofollow ugc noopener noreferrer';a.target='_blank';continue;
          }
        }catch{}
      }
      box.append(document.createTextNode(part));
    }
  }
  return box;
}
async function verifySession(resume){
  if(meta.session)return resume();
  if(!meta.siteKey)throw Error('La participación estará disponible cuando se configure la verificación de seguridad.');
  open('Verificación de seguridad');
  el('p','Protegemos la comunidad del spam. No necesitamos tu correo ni contraseña.',content);
  const challenge=el('div',undefined,content);
  if(!turnstileScript)turnstileScript=new Promise((resolve,reject)=>{
    const script=el('script',undefined,document.head);script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload=resolve;script.onerror=()=>{turnstileScript=null;script.remove();reject(Error('No se pudo cargar la verificación.'));};
  });
  await turnstileScript;
  if(!modal.open||!challenge.isConnected)return;
  const widget=window.turnstile.render(challenge,{sitekey:meta.siteKey,action:'community_session',callback:token=>attempt(async()=>{
    try{await api('session',{token});meta.session=true;modal.close();await resume();}
    catch(error){if(challenge.isConnected)window.turnstile.reset(widget);throw error;}
  })});
  modal.addEventListener('close',()=>window.turnstile.remove(widget),{once:true});
}
function updateProfile(){
  const p=meta.profile, node=$('#profile');
  node.textContent=p?'@'+p.username:'Elegir nombre';
  if(p)document.body.dataset.allyProfile=p.username;else delete document.body.dataset.allyProfile;
  node.classList.toggle('admin-profile',p?.role==='admin');
  node.setAttribute('aria-label',p?'Mi perfil: '+p.username:'Elegir nombre de usuario');
  $('#moderation').hidden=p?.role!=='admin';
}
async function refreshProfile(){meta=await api('meta');updateProfile();}
function recoveryView(code,resume){
  open('Guarda tu código de recuperación');
  el('p','Este código permite recuperar tu nombre y tus aportaciones en otro navegador o dispositivo. Guárdalo en privado: quien lo tenga podrá acceder a tu perfil.',content);
  const field=el('textarea',undefined,content);field.value=code;field.readOnly=true;field.rows=3;field.setAttribute('aria-label','Código de recuperación');
  button(content,'Copiar código',async()=>{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(code);else{field.focus();field.select();throw Error('Copia el código seleccionado manualmente.');}$('#modal-status').textContent='Código copiado.';});
  button(content,'He guardado el código',async()=>{modal.close();await resume?.();}).className='primary';
}
function chooseProfile(resume=()=>load()){
  open('¡Bienvenido a Ally Community!');
  const intro=el('div',undefined,content);intro.className='profile-welcome';const mascot=el('img',undefined,intro);mascot.src='/ally.webp';mascot.alt='';mascot.width=54;mascot.height=54;el('p','Soy Ally. ¿Cómo quieres que te llamemos? Elige un nombre único; no necesitas correo ni contraseña.',intro);
  const f=el('form',undefined,content);f.className='stack';
  const name=input(f,'Nombre de usuario','username',{max:20,required:true});name.minLength=3;name.pattern='[A-Za-z0-9_]{3,20}';name.autocomplete='username';
  el('small','De 3 a 20 letras, números o guiones bajos. El nombre será público.',f);
  const submit=el('button','Reservar mi nombre',f);submit.className='primary';
  f.onsubmit=e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;
    void attempt(async()=>{try{const username=name.value;await verifySession(async()=>{const result=await api('profile',{username});await refreshProfile();recoveryView(result.recovery,resume);});}finally{submit.disabled=false;}});};
  button(content,'Ya tengo cuenta · Acceder desde otro dispositivo',()=>accessProfile(resume)).className='primary';
  button(content,'Usar código de recuperación',()=>recoverProfile(resume));
  button(content,'Solo quiero leer',()=>modal.close());
}
function recoverProfile(resume){
  open('Recupera tu perfil');
  const f=el('form',undefined,content);f.className='stack';
  const code=input(f,'Código de recuperación','code',{max:64,required:true});code.type='password';code.autocomplete='off';code.minLength=64;code.pattern='[A-Fa-f0-9]{64}';
  const submit=el('button','Recuperar perfil',f);submit.className='primary';
  f.onsubmit=e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;const value=code.value.trim();void attempt(async()=>{try{await verifySession(async()=>{await api('profile/recover',{code:value});await refreshProfile();modal.close();await resume?.();});}finally{submit.disabled=false;}});};
}
function deviceKeyView(key){
  open('Tu clave para otros dispositivos');
  el('p','Para abrir tu mismo perfil en otro dispositivo necesitarás tu nombre de usuario y esta clave. Se muestra solo ahora: guárdala en un gestor de contraseñas y no la publiques.',content);
  const display=el('textarea',undefined,content);
  display.value=key;display.readOnly=true;display.rows=3;
  display.setAttribute('aria-label','Nueva clave de acceso entre dispositivos');
  button(content,'Copiar clave',async()=>{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(key);
    else{display.focus();display.select();throw Error('Copia la clave seleccionada manualmente.');}
    $('#modal-status').textContent='Clave copiada.';
  }).className='primary';
  el('small','La nueva clave sustituye a la anterior, pero no cierra sesiones ya iniciadas. Tu código de recuperación original sigue siendo válido.',content);
  button(content,'He guardado la clave',()=>showProfile());
}
function accessProfile(resume){
  open('Entrar en mi cuenta desde otro dispositivo');
  el('p','Introduce el nombre de usuario que ya tienes y la clave de acceso que generaste desde un dispositivo con tu sesión iniciada.',content);
  const f=el('form',undefined,content);f.className='stack';
  const username=input(f,'Nombre de usuario','username',{max:20,required:true});username.minLength=3;username.pattern='[A-Za-z0-9_]{3,20}';username.autocomplete='username';
  const key=input(f,'Clave para otros dispositivos','key',{max:64,required:true});key.type='password';key.autocomplete='off';key.minLength=64;key.pattern='[A-Fa-f0-9]{64}';
  const submit=el('button','Entrar en mi cuenta',f);submit.className='primary';
  f.onsubmit=event=>{
    event.preventDefault();
    if(submit.disabled)return;
    const name=username.value.trim(),accessKey=key.value.trim();
    submit.disabled=true;
    void attempt(async()=>{
      try{
        await verifySession(async()=>{
          await api('profile/device-login',{username:name,key:accessKey});
          await refreshProfile();
          modal.close();
          await resume?.();
        });
      }finally{key.value='';submit.disabled=false;}
    });
  };
  button(content,'¿No tienes esa clave? Usar código de recuperación',()=>recoverProfile(resume));
  el('small','Para generar o renovar la clave, abre «Mi perfil» en el dispositivo donde ya estás identificado. Cada clave nueva invalida la anterior.',content);
}
async function session(resume){if(meta.profile)return resume();chooseProfile(resume);}
async function showProfile(){
  if(!meta.profile){chooseProfile();return;}
  const data=await api('profile');
  open('Mi perfil');
  el('h3','@'+data.profile.username+(data.profile.role==='admin'?' · Administrador':''),content);
  el('p','Miembro desde '+new Date(data.profile.created*1000).toLocaleDateString('es-ES'),content);
  el('p',data.counts.posts+' publicaciones · '+data.counts.comments+' comentarios · '+data.counts.votes+' votos',content);
  el('h3','Acceso desde otros dispositivos',content);
  el('p',data.deviceKeyEnabled?'Ya tienes una clave de acceso configurada. Si no la conservas, puedes generar otra.':'Genera una clave privada para entrar con tu mismo nombre desde el móvil, PC u otro navegador.',content);
  button(content,data.deviceKeyEnabled?'Renovar clave para otros dispositivos':'Generar clave para otros dispositivos',async()=>{
    if(data.deviceKeyEnabled&&!confirm('Se invalidará la clave de acceso anterior. Las sesiones de otros dispositivos seguirán abiertas. ¿Continuar?'))return;
    const result=await api('profile/device-key',{});
    deviceKeyView(result.key);
  }).className='primary';
  el('small','La clave se muestra solo una vez. No se guarda en claro en la base de datos.',content);
  button(content,'Generar nuevo código de recuperación',async()=>{if(!confirm('El código anterior dejará de funcionar. ¿Continuar?'))return;const r=await api('profile/rotate',{});recoveryView(r.recovery);});
  if(data.profile.role==='admin')link(content,'Abrir panel de moderación','/admin.html');
  else button(content,'Identificarme como administrador',()=>{
    open('Acceso reservado al administrador');
    const f=el('form',undefined,content);f.className='stack';
    const key=input(f,'Clave privada de administración','key',{required:true});key.type='password';key.autocomplete='off';
    el('small','Introduce tu ADMIN_TOKEN de Cloudflare. No se guarda en el navegador.',f);
    const submit=el('button','Vincular mi perfil de administrador',f);submit.className='primary';
    f.onsubmit=e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;void attempt(async()=>{try{await api('profile/claim-admin',{},key.value);key.value='';await refreshProfile();await showProfile();}finally{submit.disabled=false;}});};
  });
  button(content,'Cerrar sesión',async()=>{if(!confirm('Asegúrate de tener guardado el código de recuperación. ¿Cerrar sesión?'))return;await api('profile/logout',{});location.reload();});
}
function editor({post,debate=false,shared=false,comment,replyTo}={}){
  open(comment?'Editar comentario':replyTo?'Responder':post?'Editar publicación':shared?'Compartir mi configuración':debate?'Iniciar debate':'Crear publicación');
  const f=el('form',undefined,content);f.className='stack';
  const isComment=comment||replyTo;
  if(!isComment){
    input(f,'Título','title',{max:150,required:true,value:post?.title||(debate?(params.get('title')||game):'')});
    if(!post){
      select(f,'Categoría','category',meta.categories.map(c=>[c.id,c.name])).value=String(shared?4:debate?2:meta.categories[0]?.id||'');
      input(f,'Identificador del juego (opcional)','game',{max:150,value:game}).readOnly=debate;
      input(f,'Etiquetas separadas por comas','tags',{max:124});
      const sharedBox=el('details',undefined,f);sharedBox.open=shared;
      el('summary','Configuración de rendimiento',sharedBox);
      el('small','Datos aportados por la comunidad. Los FPS observados pueden variar.',sharedBox);
      for(const [key,label] of Object.entries(labels))input(sharedBox,label,'cfg-'+key,{max:500,value:shared?params.get(key)?.slice(0,500):''});
    }
  }
  const body=input(f,'Contenido','body',{max:isComment?2000:5000,multiline:true,required:true,value:post?.body||comment?.body});
  el('small','Formato básico con **negrita**, código y enlaces Markdown HTTPS.',f);
  const preview=el('div',undefined,f);
  button(f,'Vista previa',()=>{preview.replaceChildren();renderText(preview,body.value);});
  const submit=el('button',post||comment?'Guardar':'Publicar',f);submit.className='primary';
  f.onsubmit=event=>{
    event.preventDefault();
    if(submit.disabled)return;
    submit.disabled=true;
    void attempt(async()=>{
      try{
        const data=Object.fromEntries(new FormData(f));
        let result;
        if(comment)await api('comments/'+comment.id+'/edit',{body:data.body});
        else if(replyTo)result=await api('comments',{body:data.body,post:replyTo.post,parent:replyTo.id});
        else if(post)await api('posts/'+post.id+'/edit',{title:data.title,body:data.body});
        else{
          const config=Object.fromEntries(Object.keys(labels).filter(key=>data['cfg-'+key]?.trim()).map(key=>[key,data['cfg-'+key]]));
          result=await api('posts',{title:data.title,body:data.body,category:data.category,game:data.game,debate,tags:data.tags.split(',').map(v=>v.trim()).filter(Boolean),config:Object.keys(config).length?config:null});
        }
        modal.close();
        if(!isComment&&!post&&result?.id){location.href='/?post='+result.id;return;}
        await load();
        if(result?.status==='pending')status.textContent='Tu contenido está pendiente de moderación.';
      }finally{submit.disabled=false;}
    });
  };
}
function votes(parent,item,kind){
  const bar=el('div',undefined,parent);bar.className='reaction-bar';
  bar.setAttribute('role','group');
  bar.setAttribute('aria-label',kind==='post'?'Reacciones a la publicación':'Reacciones al comentario');
  item.likes=Number(item.likes)||0;
  let busy=false;
  const like=button(bar,undefined,()=>change(1));like.className='reaction-button reaction-like';
  const thumb=el('span','👍',like);thumb.className='reaction-icon';thumb.setAttribute('aria-hidden','true');
  el('span','Me gusta',like);
  const count=el('span',undefined,like);count.className='reaction-count';
  const dislike=button(bar,undefined,()=>change(-1));dislike.className='reaction-button reaction-dislike';
  const down=el('span','👎',dislike);down.className='reaction-icon';down.setAttribute('aria-hidden','true');
  el('span','No me gusta',dislike);
  const score=el('small',undefined,bar);score.className='reaction-score';
  function update(){
    count.textContent=String(item.likes);
    score.textContent='Puntuación: '+item.score;
    like.setAttribute('aria-pressed',String(item.vote===1));
    dislike.setAttribute('aria-pressed',String(item.vote===-1));
    like.setAttribute('aria-label',(item.vote===1?'Quitar Me gusta':'Dar Me gusta')+'; '+item.likes+' en total');
    dislike.setAttribute('aria-label',item.vote===-1?'Quitar voto negativo':'Votar en contra');
  }
  async function change(value){
    return session(async()=>{
      if(busy)return;
      busy=true;like.disabled=true;dislike.disabled=true;
      try{
        const previous=Number(item.vote)||0;
        const next=previous===value?0:value;
        await api('vote',{kind,target:item.id,value:next});
        item.likes=Math.max(0,item.likes+(next===1?1:0)-(previous===1?1:0));
        item.score+=next-previous;
        item.vote=next;
        update();
      }finally{
        busy=false;like.disabled=false;dislike.disabled=false;
      }
    });
  }
  update();
}
function describe(parent,item){
  const row=el('small',undefined,parent);
  const fields=[
    item.pinned?'Fijada':null,
    item.categoryName,
    item.username?'@'+item.username:'Usuario anónimo',
    item.author?'Autor original':null
  ].filter(Boolean);
  if(fields.length)row.append(document.createTextNode(fields.join(' · ')+' · '));
  const created=new Date(item.created*1000);
  const date=created.toLocaleDateString('es-ES');
  const hour=created.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',hour12:false});
  const timestamp=el('time',date+' · '+hour+' h',row);
  timestamp.dateTime=created.toISOString();
  timestamp.title='Fecha y hora de publicación según la zona horaria de tu dispositivo';
  if(item.role==='admin'){
    const badge=el('span','ADMIN',row);
    badge.className='admin-badge';
  }
}
function actions(parent,item,kind){
  const box=el('div',undefined,parent);box.className='actions';
  button(box,'Denunciar',()=>session(()=>{
    open('Denunciar contenido');
    const f=el('form',undefined,content);f.className='stack';
    select(f,'Motivo','reason',reasons.map(v=>[v,v]));
    input(f,'Detalles (opcional)','details',{max:1000,multiline:true});
    el('button','Enviar denuncia',f);
    f.onsubmit=event=>{
      event.preventDefault();
      void attempt(async()=>{await api('report',{kind,target:item.id,...Object.fromEntries(new FormData(f))});modal.close();status.textContent='Denuncia enviada.';});
    };
  }));
  if(item.own){
    button(box,'Editar',()=>session(()=>editor(kind==='post'?{post:item}:{comment:item})));
    button(box,'Eliminar',()=>{
      open('Eliminar contenido');
      el('p','El contenido quedará retirado. Las respuestas de un comentario pueden seguir visibles.',content);
      button(content,'Confirmar eliminación',async()=>{
        await api((kind==='post'?'posts/':'comments/')+item.id+'/delete',{});
        modal.close();
        if(kind==='post')location.href='/';else await load();
      });
    });
  }
  return box;
}
function visitLabel(views){
  const count=Math.max(0,Number(views)||0);
  return count+' '+(count===1?'visita única':'visitas únicas');
}
async function recordView(post,element){
  try{
    const response=await api('visits',{post});
    if(element.isConnected)element.textContent='👁 '+visitLabel(response.views);
  }catch{
    // El contador es informativo: un fallo no debe bloquear el hilo.
  }
}
function card(parent,item,detail=false){
  const article=el('article',undefined,parent);article.className='card';
  const info=el('div',undefined,article);
  describe(info,item);
  const heading=el(detail?'h1':'h2',undefined,info);
  if(detail)heading.textContent=item.title;
  else link(heading,item.title,'/?post='+item.id);
  renderText(info,item.body);
  if(item.game)link(info,detail?'Ver ficha del juego en Ally Lab':'Ficha del juego',gameLink(item.game));
  if(item.config){
    el('p','Configuración de la comunidad · FPS comunicados por el usuario',info);
    if(detail){
      const config=el('dl',undefined,info);config.className='config';
      for(const [key,value] of Object.entries(JSON.parse(item.config))){
        el('dt',labels[key]||key,config);el('dd',value,config);
      }
    }
  }
  if(detail&&item.tags){
    const tags=JSON.parse(item.tags);
    if(tags.length)el('small',tags.map(v=>'#'+v).join(' '),info);
  }
  const metrics=el('div',undefined,info);metrics.className='post-metrics';
  el('span',item.replies+' '+(item.replies===1?'comentario':'comentarios'),metrics);
  const views=el('span','👁 '+visitLabel(item.views),metrics);views.className='post-view-count';
  views.title='Visitas únicas aproximadas; un perfil o navegador se cuenta una vez';
  votes(info,item,'post');
  if(detail)actions(info,item,'post');
  return views;
}
async function comments(parent,post,parentId,sort,after){
  const query=new URLSearchParams({post,sort});
  if(parentId)query.set('parent',parentId);
  if(after)query.set('after',after);
  const result=await api('comments?'+query);
  if(!result.rows.length&&!after&&!parentId)el('p','Todavía no hay comentarios.',parent);
  for(const item of result.rows){
    const article=el('article',undefined,parent);article.className='comment';
    if(item.status==='deleted')el('p','[Comentario eliminado]',article);
    else{
      describe(article,item);renderText(article,item.body);votes(article,item,'comment');
      const controls=actions(article,item,'comment');
      if(item.depth<3)button(controls,'Responder',()=>session(()=>editor({replyTo:item})));
    }
    if(item.children){
      const branch=el('details',undefined,article);
      el('summary','Respuestas',branch);
      const list=el('div',undefined,branch);list.className='branches';
      branch.addEventListener('toggle',()=>{
        if(branch.open&&!list.hasChildNodes())void attempt(()=>comments(list,post,item.id,sort));
      });
    }
  }
  if(result.next){
    const next=button(parent,'Cargar más comentarios',async()=>{await comments(parent,post,parentId,sort,result.next);next.remove();});
  }
}
async function list(after){
  const current=++generation;
  const query=new URLSearchParams(new FormData(form));if(game)query.set('game',game);
  const ranking=query.get('sort')==='views';
  $('#feed h1').textContent=ranking?'Ranking de los más visitados':'Publicaciones';
  if(after)query.set('after',after);
  const {rows,next}=await api('posts?'+query);
  if(current!==generation)return;
  const target=$('#posts');
  if(!after)target.replaceChildren();
  if(!rows.length&&!after){const empty=el('p','Todavía no hay publicaciones que coincidan.',target);empty.className='empty';}
  rows.forEach(item=>card(target,item));
  if(next){
    const more=button(target,'Cargar más publicaciones',async()=>{await list(next);more.remove();});
  }
}
async function load(){
  const postID=params.get('post');
  if(!postID)return list();
  $('#feed').hidden=true;
  const thread=$('#thread');
  thread.hidden=false;
  thread.replaceChildren();
  link(thread,'Todas las publicaciones','/');
  const post=await api('posts/'+encodeURIComponent(postID));
  const counter=card(thread,post,true);
  if(post.status==='pending'){el('p','Pendiente de revisión por moderación.',thread);return;}
  void recordView(post.id,counter);
  if(!post.closed)button(thread,'Comentar',()=>session(()=>editor({replyTo:{post:post.id}})));
  else el('p','Debate cerrado.',thread);
  const sort=select(thread,'Orden de comentarios','comment-sort',[['recent','Recientes'],['popular','Populares']]);
  const replies=el('div',undefined,thread);
  sort.onchange=()=>attempt(async()=>{replies.replaceChildren();await comments(replies,post.id,null,sort.value);});
  await comments(replies,post.id,null,sort.value);
}
async function init(){
  meta=await api('meta');
  updateProfile();$('#profile').onclick=()=>attempt(showProfile);
  for(const c of meta.categories)el('option',c.name,form.elements.category).value=c.id;
  if(['recent','popular','trend','comments','views'].includes(params.get('sort')))form.elements.sort.value=params.get('sort');
  $('#create').onclick=()=>attempt(()=>session(()=>editor()));
  $('#notices').onclick=()=>attempt(async()=>{
    const data=await api('notices');open('Notificaciones');
    if(!data.rows.length)el('p','No hay avisos en esta sesión.',content);
    for(const item of data.rows){const p=el('p',undefined,content);link(p,item.message,'/?post='+item.post);}
  });
  form.onsubmit=e=>{e.preventDefault();void attempt(()=>list());};
  $('#stats').addEventListener('toggle',()=>{
    const node=$('#stats div');
    if($('#stats').open&&!node.hasChildNodes())void attempt(async()=>{
      const data=await api('stats');
      el('p',data.totals.posts+' publicaciones · '+data.totals.comments+' comentarios · '+visitLabel(data.totals.uniqueViews)+' registradas · '+data.totals.configurations+' configuraciones · '+data.totals.recentDebates+' debates recientes',node);
      for(const entry of data.categories)el('p',entry.name+' · '+entry.total,node);
      for(const entry of data.best){const p=el('p',undefined,node);link(p,entry.title+' · '+entry.score+' votos','/?post='+entry.id);}
      el('h3','Top 5 de publicaciones más visitadas',node);
      if(!data.mostVisited.length)el('p','Todavía no hay visitas registradas.',node);
      else{
        const top=el('ol',undefined,node);top.className='most-visited-list';
        for(const entry of data.mostVisited){
          const item=el('li',undefined,top);
          link(item,entry.title,'/?post='+entry.id);
          el('small','👁 '+visitLabel(entry.views),item);
        }
      }
    });
  });
  if(game){
    const box=$('#game');box.className='empty';
    el('h2',params.get('title')?.slice(0,150)||'Publicaciones del juego',box);
    link(box,'Ficha en Ally Lab',gameLink(game));
    button(box,'Iniciar debate',()=>session(()=>editor({debate:true})));
    if(params.get('share')==='1')button(box,'Abrir borrador de configuración',()=>session(()=>editor({shared:true})));
  }
  await load();
  let prompted=false;try{prompted=sessionStorage.getItem('ally-profile-prompted')==='1';}catch{}
  if(!meta.profile&&!prompted){try{sessionStorage.setItem('ally-profile-prompted','1');}catch{}chooseProfile();}
}
void attempt(init);

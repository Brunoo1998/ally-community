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
  if(typeof text==='string'){
    if(/^(Eliminar|Confirmar eliminación|Quitar foto)/.test(text))node.dataset.variant='danger';
    else if(/^(Denunciar|Cerrar sesión|Solo quiero leer)/.test(text))node.dataset.variant='quiet';
    else if(/^(Comentar|Responder|Iniciar debate|Enviar)/.test(text))node.dataset.variant='action';
    else if(/^Cargar más/.test(text))node.dataset.variant='more';
  }
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
const stickerPack={saludo:['¡Hola!','👋'],fiesta:['¡Bien hecho!','🎉'],gaming:['A jugar','🎮'],gracias:['¡Gracias!','💚'],ayuda:['¿Te ayudo?','💡'],risa:['¡Ja, ja!','😄'],pensando:['Procesando…','🤔'],victoria:['¡Victoria!','🏆']};
function makeSticker(parent,id,compact=false){
  if(!Object.hasOwn(stickerPack,id))return null;
  const [label,symbol]=stickerPack[id];
  const wrap=el('span',undefined,parent);wrap.className='ally-sticker sticker-'+id+(compact?' sticker-compact':'');
  wrap.setAttribute('role','img');wrap.setAttribute('aria-label','Sticker de Ally: '+label);
  const art=el('span',undefined,wrap);art.className='sticker-art';art.setAttribute('aria-hidden','true');
  const img=el('img',undefined,art);img.src='/ally.webp';img.alt='';img.loading='lazy';
  const emoji=el('span',symbol,art);emoji.className='sticker-symbol';
  const caption=el('span',label,wrap);caption.className='sticker-caption';caption.setAttribute('aria-hidden','true');
  return wrap;
}
function stickerPicker(form,body){
  const picker=el('details',undefined,form);picker.className='sticker-picker';
  el('summary','😄 Stickers de Ally',picker);
  el('small','Elige un sticker para añadirlo al mensaje. Puedes combinarlo con texto y fotos.',picker);
  const grid=el('div',undefined,picker);grid.className='sticker-options';
  for(const [id,[label]] of Object.entries(stickerPack)){
    const choose=button(grid,undefined,()=>{
      const token='[sticker:'+id+']',start=body.selectionStart??body.value.length,end=body.selectionEnd??start;
      const prefix=start&& !/\s/.test(body.value[start-1])?' ':'';
      const value=prefix+token+' ';
      if(body.value.length-(end-start)+value.length>body.maxLength)throw Error('El mensaje ha alcanzado su longitud máxima.');
      body.setRangeText(value,start,end,'end');body.focus();
    });
    choose.className='sticker-choice';choose.setAttribute('aria-label','Añadir sticker: '+label);makeSticker(choose,id,true);
  }
}
function botIdentity(parent,item){
  if(item.username!=='Ally'||item.role!=='member')return;
  const badge=el('span','ALLY IA',parent);badge.className='ally-bot-badge';badge.title='Mascota virtual oficial · respuestas generadas por IA';
}

function renderText(parent,text,compact=false){
  const box=el('div',undefined,parent);box.className='prose';
  const pattern=/(\[sticker:[a-z]+\]|\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g;
  for(const part of String(text||'').split(pattern)){
    const sticker=part.match(/^\[sticker:([a-z]+)\]$/);
    if(sticker&&makeSticker(box,sticker[1],compact))continue;
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
  if(p?.role==='admin')void refreshAdminNoticeCount();else setAdminNoticeCount(0);
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

function photoUrl(kind,id,index){return '/api/photos/'+kind+'/'+id+'?index='+index;}
function renderPhotos(parent,item,kind,compact=false){
  const count=Math.min(kind==='post'?3:2,Number(item.photoCount)||0);
  if(!count)return;
  const gallery=el('div',undefined,parent);gallery.className='photo-gallery'+(compact?' compact':'');
  for(let i=0;i<count;i++){
    const a=link(gallery,'',photoUrl(kind,item.id,i));a.target='_blank';a.rel='noopener noreferrer';
    const img=el('img',undefined,a);img.src=a.href;img.alt='Foto '+(i+1)+' adjunta';img.loading='lazy';img.decoding='async';
  }
}
async function compressPhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15000000)throw Error('Selecciona una foto JPG, PNG o WebP de hasta 15 MB.');
  const bitmap=await createImageBitmap(file);
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>50000000)throw Error('Imagen demasiado grande.');
    const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw Error('No se puede procesar la imagen.');
    for(const max of [1600,1280,960,720,480]){
      const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.84,.70,.54,.40]){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
        if(blob&&blob.type==='image/webp'&&blob.size<=150000)return blob;
      }
    }
    throw Error('No se ha podido comprimir la imagen.');
  }finally{bitmap.close();}
}
async function encodePhoto(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());let text='';
  for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text);
}
function photoEditor(form,existing,kind){
  const max=kind==='post'?3:2;
  const box=el('div',undefined,form);box.className='photo-editor';
  el('strong','📷 Adjuntar fotos',box);
  el('small','Hasta '+max+' imágenes JPG, PNG o WebP. Se comprimen y se eliminan los metadatos del archivo original. Revisa que la foto no muestre datos privados.',box);
  const gallery=el('div',undefined,box);gallery.className='photo-gallery';
  const picker=el('input',undefined,el('label','Seleccionar fotos',box));picker.type='file';picker.accept='image/jpeg,image/png,image/webp';picker.multiple=true;
  const entries=Array.from({length:Math.min(max,Number(existing?.photoCount)||0)},(_,index)=>({index,url:photoUrl(kind,existing.id,index)}));
  let busy=false,changed=false;
  const feedback=el('small','',box);feedback.setAttribute('role','status');
  const cleanup=()=>{for(const entry of entries)if(entry.blob)URL.revokeObjectURL(entry.url);};
  modal.addEventListener('close',cleanup,{once:true});
  function refresh(){
    gallery.replaceChildren();
    for(const entry of entries){
      const wrap=el('div',undefined,gallery),img=el('img',undefined,wrap);img.src=entry.url;img.alt='Vista previa de foto';
      button(wrap,'Quitar foto',()=>{if(busy)return;if(entry.blob)URL.revokeObjectURL(entry.url);entries.splice(entries.indexOf(entry),1);changed=true;refresh();});
    }
    picker.disabled=busy||entries.length>=max;
    feedback.textContent=entries.length+' de '+max+' fotos';
  }
  picker.onchange=async()=>{
    if(busy)return;busy=true;picker.disabled=true;const files=Array.from(picker.files||[]);picker.value='';
    let failure='';
    try{
      if(files.length+entries.length>max)throw Error('Solo se admiten '+max+' fotos.');
      for(const file of files){const blob=await compressPhoto(file);if(!box.isConnected)break;entries.push({blob,url:URL.createObjectURL(blob)});changed=true;}
    }catch(error){failure=error.message;}finally{busy=false;refresh();if(failure)feedback.textContent=failure;}
  };
  refresh();
  return {count:()=>entries.length,async values(){
    if(busy)throw Error('Espera a que terminen de prepararse las fotos.');
    if(existing&&!changed)return undefined;
    return Promise.all(entries.map(async entry=>{
      if(entry.blob)return encodePhoto(entry.blob);
      const response=await fetch(entry.url);if(!response.ok)throw Error('No se pudo conservar una de las fotos existentes.');
      return encodePhoto(await response.blob());
    }));
  }};
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
  const body=input(f,'Contenido','body',{max:isComment?2000:5000,multiline:true,required:false,value:post?.body||comment?.body});
  el('small','Formato básico con **negrita**, código y enlaces Markdown HTTPS.',f);
  stickerPicker(f,body);
  const attachments=photoEditor(f,comment||post,isComment?'comment':'post');
  const preview=el('div',undefined,f);preview.className='editor-preview';
  const editorActions=el('div',undefined,f);editorActions.className='editor-actions';
  button(editorActions,'Vista previa',()=>{preview.replaceChildren();renderText(preview,body.value);});
  const submit=el('button',post||comment?'Guardar':'Publicar',editorActions);submit.className='primary';
  f.onsubmit=event=>{
    event.preventDefault();
    if(submit.disabled)return;
    submit.disabled=true;
    void attempt(async()=>{
      try{
        const data=Object.fromEntries(new FormData(f));
        const photos=await attachments.values();
        if(!data.body.trim()&&!attachments.count())throw Error('Escribe un mensaje o adjunta una foto.');
        let result;
        if(comment)await api('comments/'+comment.id+'/edit',{body:data.body,photos});
        else if(replyTo)result=await api('comments',{body:data.body,post:replyTo.post,parent:replyTo.id,photos});
        else if(post)await api('posts/'+post.id+'/edit',{title:data.title,body:data.body,photos});
        else{
          const config=Object.fromEntries(Object.keys(labels).filter(key=>data['cfg-'+key]?.trim()).map(key=>[key,data['cfg-'+key]]));
          result=await api('posts',{title:data.title,body:data.body,category:data.category,game:data.game,debate,photos,tags:data.tags.split(',').map(v=>v.trim()).filter(Boolean),config:Object.keys(config).length?config:null});
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
  const row=el('small',undefined,parent);row.className='post-author';
  const fields=[
    item.pinned?'Fijada':null,
    item.categoryName,
    item.username?'@'+item.username:'Usuario anónimo',
    item.author?'Autor original':null
  ].filter(Boolean);
  if(item.username==='Ally'&&item.role==='member'){const avatar=el('img',undefined,row);avatar.className='ally-bot-avatar';avatar.src='/ally.webp';avatar.alt='';}
  if(fields.length)row.append(document.createTextNode(fields.join(' · ')+' · '));
  botIdentity(row,item);
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
    el('button','Enviar denuncia',f).className='primary';
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
function renderRecentComments(parent,post){
  const recent=Array.isArray(post.latestComments)?post.latestComments:[];
  if(!recent.length)return;
  const section=el('section',undefined,parent);section.className='recent-comments';
  section.setAttribute('aria-label','Dos últimos comentarios de la publicación');
  const header=el('div',undefined,section);header.className='recent-comments-head';
  el('strong','💬 Últimos comentarios',header);
  el('small',recent.length===1?'1 comentario reciente':'2 comentarios recientes',header);

  for(const comment of recent){
    const block=el('div',undefined,section);block.className='recent-comment';
    const meta=el('div',undefined,block);meta.className='recent-comment-meta';
    if(comment.username==='Ally'&&comment.role==='member'){const avatar=el('img',undefined,meta);avatar.className='ally-bot-avatar';avatar.src='/ally.webp';avatar.alt='';}
    const author=el('strong',comment.username?'@'+comment.username:'Usuario anónimo',meta);
    botIdentity(meta,comment);
    if(comment.role==='admin'){
      const badge=el('span','ADMIN',meta);badge.className='admin-badge';
    }
    const created=new Date(comment.created*1000);
    const date=created.toLocaleDateString('es-ES');
    const hour=created.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',hour12:false});
    const stamp=el('time',date+' · '+hour+' h',meta);stamp.dateTime=created.toISOString();
    const text=String(comment.body||'');
    const flattened=text.replace(/\s+/g,' ').trim();
    const fullLength=Number(comment.bodyLength)||text.length;
    const excerpt=flattened.slice(0,185).replace(/\[sticker:[a-z]*$/,'').trimEnd();
    const trimmed=fullLength>185;
    const textNode=el('div',undefined,block);textNode.className='recent-comment-text';
    renderText(textNode,trimmed?excerpt+'…':text,true);
    renderPhotos(block,comment,'comment',true);

    if(fullLength>600){
      const full=link(block,'Leer comentario completo en el post','/?post='+post.id);
      full.className='recent-comment-link';
    }else if(trimmed){
      const expand=button(block,'Ver más',()=>{
        const open=expand.getAttribute('aria-expanded')==='true';
        textNode.replaceChildren();renderText(textNode,open?excerpt+'…':text,true);
        expand.textContent=open?'Ver más':'Ver menos';
        expand.setAttribute('aria-expanded',String(!open));
      });
      expand.className='recent-comment-toggle';
      expand.setAttribute('aria-expanded','false');
      expand.setAttribute('aria-label','Mostrar u ocultar el comentario completo de '+(comment.username?'@'+comment.username:'Usuario anónimo'));
    }
  }
}
function card(parent,item,detail=false){
  const article=el('article',undefined,parent);article.className='card'+(detail?' post-detail':' post-card');
  const info=el('div',undefined,article);
  describe(info,item);
  const heading=el(detail?'h1':'h2',undefined,info);
  if(detail)heading.textContent=item.title;
  else link(heading,item.title,'/?post='+item.id);
  renderText(info,item.body);renderPhotos(info,item,'post',!detail);
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
  if(!detail){
    renderRecentComments(info,item);
    const open=link(info,'Abrir publicación','/?post='+item.id);
    open.className='ui-button open-post';open.setAttribute('aria-label','Abrir publicación: '+item.title);
  }
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
    const article=el('article',undefined,parent);article.className='comment'+(item.username==='Ally'&&item.role==='member'?' ally-bot-comment':'');
    if(item.status==='deleted')el('p','[Comentario eliminado]',article);
    else{
      describe(article,item);renderText(article,item.body);renderPhotos(article,item,'comment');votes(article,item,'comment');
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
  link(thread,'← Todas las publicaciones','/').className='ui-button quiet back-feed';
  const post=await api('posts/'+encodeURIComponent(postID));
  const counter=card(thread,post,true);
  if(post.status==='pending'){el('p','Pendiente de revisión por moderación.',thread);return;}
  void recordView(post.id,counter);
  const threadTools=el('section',undefined,thread);threadTools.className='thread-tools';
  el('h2','Comentarios',threadTools);
  if(!post.closed)button(threadTools,'Comentar',()=>session(()=>editor({replyTo:{post:post.id}}))).className='primary';
  else el('p','Debate cerrado.',threadTools);
  const sort=select(threadTools,'Orden de comentarios','comment-sort',[['recent','Recientes'],['popular','Populares']]);
  const replies=el('div',undefined,thread);
  sort.onchange=()=>attempt(async()=>{replies.replaceChildren();await comments(replies,post.id,null,sort.value);});
  await comments(replies,post.id,null,sort.value);
}
function setAdminNoticeCount(value){
  const button=$('#notices');
  if(!button)return;
  let badge=button.querySelector('.admin-unread');
  const count=Number(value)||0;
  if(count<=0){
    badge?.remove();button.removeAttribute('aria-label');return;
  }
  if(!badge){badge=el('span',undefined,button);badge.className='admin-unread';badge.setAttribute('aria-hidden','true');}
  badge.textContent=count>99?'99+':String(count);
  button.setAttribute('aria-label','Notificaciones: '+count+' avisos de administración sin leer');
}
async function refreshAdminNoticeCount(){
  if(meta?.profile?.role!=='admin'||document.hidden)return;
  try{const data=await api('admin-notices?count=1');if(meta?.profile?.role==='admin')setAdminNoticeCount(data.unread);}catch{}
}
async function showNoticeInbox(){
  open('Notificaciones');
  const target=el('section',undefined,content);
  if(meta?.profile?.role==='admin'){
    const admin=el('section',undefined,target);admin.className='admin-inbox';
    const head=el('div',undefined,admin);head.className='admin-inbox-heading';
    el('h3','Registro privado de administración',head);
    el('p','Solo disponible para tu perfil de administrador. Los avisos de suspensión son propuestas y no se ejecutan sin tu autorización.',admin);
    const list=el('div',undefined,admin);list.className='admin-inbox-list';
    const controls=el('div',undefined,admin);controls.className='admin-inbox-controls';
    let latest=0;
    async function loadAdmin(before){
      const data=await api('admin-notices'+(before?'?before='+encodeURIComponent(before):''));
      if(!admin.isConnected)return;
      setAdminNoticeCount(data.unread);
      if(!before){list.replaceChildren();latest=data.rows[0]?.id||0;}
      for(const row of data.rows){
        const card=el('article',undefined,list);card.className='admin-log'+(row.read_at?'':' unread');
        const label=el('small',row.read_at?'Leído':'Nuevo · Moderación',card);label.className='admin-log-label';
        const date=el('time',new Date(row.created*1000).toLocaleString('es-ES',{timeZone:'Europe/Madrid'}),card);date.dateTime=new Date(row.created*1000).toISOString();
        el('h4',row.title,card);
        const body=el('div',row.message,card);body.className='admin-log-body';
      }
      if(!data.rows.length&&!before)el('p','No hay informes de moderación todavía.',list);
      controls.replaceChildren();
      if(data.unread&&latest)button(controls,'Marcar como leídos',async()=>{await api('admin-notices/read',{through:latest});await loadAdmin();});
      if(data.next)button(controls,'Cargar informes anteriores',()=>loadAdmin(data.next));
    }
    try{await loadAdmin();}catch(e){if(admin.isConnected)el('p','No se ha podido cargar el registro privado. '+e.message,list);}
  }
  if(!target.isConnected)return;
  const normal=el('section',undefined,target);normal.className='normal-inbox';
  el('h3','Avisos de tu perfil',normal);
  const data=await api('notices');
  if(!normal.isConnected)return;
  if(!data.rows.length)el('p','No hay avisos en esta sesión.',normal);
  for(const item of data.rows){
    const p=el('p',undefined,normal);p.className='profile-notice';
    const stamp=el('small',new Date(item.created*1000).toLocaleString('es-ES'),p);
    const message=el('span',item.message,p);
    if(item.post>0)link(p,'Ver hilo','/?post='+item.post);
  }
}
async function init(){
  meta=await api('meta');
  updateProfile();$('#profile').onclick=()=>attempt(showProfile);
  for(const c of meta.categories)el('option',c.name,form.elements.category).value=c.id;
  if(['recent','popular','trend','comments','views'].includes(params.get('sort')))form.elements.sort.value=params.get('sort');
  $('#create').onclick=()=>attempt(()=>session(()=>editor()));
  $('#notices').onclick=()=>attempt(showNoticeInbox);
  window.addEventListener('focus',()=>void refreshAdminNoticeCount());
  document.addEventListener('visibilitychange',()=>void refreshAdminNoticeCount());
  setInterval(()=>{if(meta?.profile?.role==='admin'&&!document.hidden)void refreshAdminNoticeCount();},60000);
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

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
async function api(route,data){
  const response=await fetch('/api/'+route,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
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
async function session(resume){
  if(meta.session)return resume();
  if(!meta.siteKey)throw Error('La participación estará disponible cuando se configure la verificación de seguridad.');
  open('Verifica tu sesión');
  el('p','Puedes participar sin registrarte. Si borras tus cookies o cambias de navegador, puedes perder el acceso a tus publicaciones.',content);
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
  const box=el('div',undefined,parent);box.className='votes';
  const change=value=>session(async()=>{
    const next=item.vote===value?0:value;
    await api('vote',{kind,target:item.id,value:next});
    item.score+=next-(item.vote||0);item.vote=next;
    count.textContent=item.score;update();
  });
  const up=button(box,'▲',()=>change(1));up.setAttribute('aria-label','Votar a favor');
  const count=el('strong',String(item.score),box);
  const down=button(box,'▼',()=>change(-1));down.setAttribute('aria-label','Votar en contra');
  function update(){up.setAttribute('aria-pressed',String(item.vote===1));down.setAttribute('aria-pressed',String(item.vote===-1));}
  update();
}
function describe(parent,item){el('small',[item.pinned?'Fijada':null,item.categoryName,'Usuario anónimo'+(item.author?' · Autor original':''),new Date(item.created*1000).toLocaleDateString('es-ES')].filter(Boolean).join(' · '),parent);}
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
    button(box,'Editar',()=>editor(kind==='post'?{post:item}:{comment:item}));
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
function card(parent,item,detail=false){
  const article=el('article',undefined,parent);article.className='card';
  votes(article,item,'post');
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
  el('p',item.replies+' '+(item.replies===1?'comentario':'comentarios'),info);
  if(detail)actions(info,item,'post');
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
  if(after)query.set('after',after);
  const {rows,next}=await api('posts?'+query);
  if(current!==generation)return;
  const target=$('#posts');
  if(!after)target.replaceChildren();
  if(!rows.length&&!after){const empty=el('p','Todavía no hay publicaciones que coincidan.',target);empty.className='empty';const robot=el('img',undefined,empty);robot.src='/ally.webp';robot.alt='';robot.width=40;robot.height=44;}
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
  const post=await api('posts/'+encodeURIComponent(postID));card(thread,post,true);
  if(post.status==='pending'){el('p','Pendiente de revisión por moderación.',thread);return;}
  if(!post.closed)button(thread,'Comentar',()=>session(()=>editor({replyTo:{post:post.id}})));
  else el('p','Debate cerrado.',thread);
  const sort=select(thread,'Orden de comentarios','comment-sort',[['recent','Recientes'],['popular','Populares']]);
  const list=el('div',undefined,thread);
  sort.onchange=()=>attempt(async()=>{list.replaceChildren();await comments(list,post.id,null,sort.value);});
  await comments(list,post.id,null,sort.value);
}
async function init(){
  meta=await api('meta');
  for(const c of meta.categories)el('option',c.name,form.elements.category).value=c.id;
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
      el('p',data.totals.posts+' publicaciones · '+data.totals.comments+' comentarios · '+data.totals.configurations+' configuraciones · '+data.totals.recentDebates+' debates recientes',node);
      for(const entry of data.categories)el('p',entry.name+' · '+entry.total,node);
      for(const entry of data.best){const p=el('p',undefined,node);link(p,entry.title+' · '+entry.score+' votos','/?post='+entry.id);}
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
}
void attempt(init);

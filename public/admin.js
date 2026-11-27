let key;
const panel=document.querySelector('#panel'), status=document.querySelector('#status'), login=document.querySelector('#login');
function make(parent,tag,text){
  const node=document.createElement(tag);node.textContent=text||'';parent.append(node);return node;
}
function input(parent,label,value,type='text'){
  const node=make(make(parent,'label',label),'input');node.type=type;
  if(type==='checkbox')node.checked=!!value;else node.value=value??'';
  return node;
}
async function api(path='',data){
  const headers={Authorization:'Bearer '+key};
  if(data!==undefined)headers['Content-Type']='application/json';
  const response=await fetch('/api/admin'+path,{headers,...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
  const result=await response.json();
  if(!response.ok)throw Error(result.error);
  return result;
}
async function attempt(fn){
  try{status.textContent='';await fn();}
  catch(error){status.textContent=error.message;}
}
function button(parent,label,fn){
  const node=make(parent,'button',label);
  node.onclick=()=>attempt(async()=>{
    node.disabled=true;
    try{await fn();}finally{node.disabled=false;}
  });
}
function change(parent,label,route,data){button(parent,label,async()=>{await api(route,typeof data==='function'?data():data);await load();});}
function group(parent,label){
  const details=make(parent,'details');make(details,'summary',label);return details;
}
function list(parent,rows,kind){
  for(const item of rows){
    const box=make(parent,'article');box.className='comment';
    make(box,'h3',item.title||'Comentario #'+item.id);
    make(box,'p',item.status+' · '+item.body);
    if(item.photoCount)button(box,'Ver fotos ('+item.photoCount+')',async()=>{
      const gallery=make(box,'div');gallery.className='photo-gallery';
      for(let i=0;i<item.photoCount;i++){
        const response=await fetch('/api/photos/'+kind+'/'+item.id+'?index='+i,{headers:{Authorization:'Bearer '+key}});
        if(!response.ok)throw Error('No se pudo cargar la foto.');
        const url=URL.createObjectURL(await response.blob()),img=make(gallery,'img');img.alt='Foto adjunta '+(i+1);img.onload=img.onerror=()=>URL.revokeObjectURL(url);img.src=url;
      }
    });
    if(item.status==='deleted')continue;
    for(const [label,value] of [['Publicar','public'],['Ocultar','hidden'],['Eliminar','deleted']])
      change(box,label,'/'+kind,()=>{if(value==='deleted'&&!confirm('¿Eliminar el contenido?'))throw Error('Eliminación cancelada.');return {id:item.id,status:value};});
    if(kind==='post'){
      change(box,item.pinned?'Desfijar':'Fijar','/post',{id:item.id,pinned:!item.pinned,closed:!!item.closed});
      change(box,item.closed?'Reabrir':'Cerrar debate','/post',{id:item.id,pinned:!!item.pinned,closed:!item.closed});
    }
    change(box,'Bloquear 24 h','/block',{owner:item.owner,seconds:86400});
    change(box,'Bloquear permanentemente','/block',()=>{if(!confirm('¿Bloquear esta sesión?'))throw Error('Bloqueo cancelado.');return {owner:item.owner,seconds:0,permanent:true};});
    change(box,'Desbloquear','/block',{owner:item.owner,seconds:0});
  }
}
async function load(){
  const data=await api();
  panel.hidden=false;panel.replaceChildren();
  const settings=data.settings[0];
  const readonly=input(panel,'Solo lectura',settings.readonly,'checkbox');
  const stop=input(panel,'Pausar publicaciones nuevas',settings.stop_posts,'checkbox');
  const review=input(panel,'Moderación previa',settings.review,'checkbox');
  change(panel,'Guardar ajustes','/settings',()=>({readonly:readonly.checked,stop_posts:stop.checked,review:review.checked}));
  const categories=group(panel,'Categorías');
  for(const item of [...data.categories,{}]){
    const box=make(categories,'article');box.className='comment';
    const name=input(box,'Nombre',item.name),position=input(box,'Orden',item.position,'number'),hidden=input(box,'Oculta',item.hidden,'checkbox');
    change(box,item.id?'Guardar categoría':'Crear categoría','/category',()=>({id:item.id,name:name.value,position:position.value,hidden:hidden.checked}));
    if(item.id)change(box,'Eliminar categoría vacía','/category',{id:item.id,delete:true});
  }
  const reports=group(panel,'Denuncias');
  for(const report of data.reports){
    make(reports,'p',report.kind+' #'+report.target+' · '+report.reason+' · '+report.details);
    if(!report.closed)change(reports,'Cerrar denuncia #'+report.id,'/report',{id:report.id});
  }
  list(group(panel,'Publicaciones'),data.posts,'post');
  list(group(panel,'Comentarios'),data.comments,'comment');
  const audit=group(panel,'Historial de moderación');
  for(const row of data.audit)make(audit,'p',new Date(row.created*1000).toLocaleString('es-ES')+' · '+row.action+' · '+row.target);
  const stats=group(panel,'Estadísticas');
  button(stats,'Consultar',async()=>{
    const result=await fetch('/api/stats');if(!result.ok)throw Error('Estadísticas no disponibles.');
    const {totals}=await result.json();make(stats,'pre',JSON.stringify(totals,null,2));
  });
  const exportBox=group(panel,'Exportar información');
  for(const table of ['posts','comments','categories','reports','audit','settings','sessions','votes','notices']){
    button(exportBox,table,async()=>{
      const rows=[];let after=0;
      for(;;){
        const result=await api('/export?table='+table+'&after='+after);
        rows.push(...result.rows);
        if(result.rows.length<200)break;
        after=result.rows.at(-1).cursor;
      }
      const url=URL.createObjectURL(new Blob([JSON.stringify(rows)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=table+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }
}
login.onsubmit=event=>{
  event.preventDefault();
  key=login.elements.key.value;
  login.reset();
  void attempt(load);
};

// Ally Community's independent, local-only interactive mascot.
const root=document.createElement('aside');
root.className='ally-pet';
root.setAttribute('aria-label','Mascota de Ally Community');
const pet=document.createElement('button');
pet.type='button';pet.className='ally-pet-button';
pet.setAttribute('aria-label','Jugar con Ally. Arrastra para moverla o usa Mayús y las flechas.');
const img=document.createElement('img');
img.src='/ally.webp';img.alt='';img.draggable=false;img.width=64;img.height=64;
pet.append(img);
const hide=document.createElement('button');
hide.type='button';hide.className='ally-pet-hide';hide.textContent='×';hide.setAttribute('aria-label','Minimizar mascota');
const restore=document.createElement('button');
restore.type='button';restore.className='ally-pet-restore';restore.textContent='Ally';restore.setAttribute('aria-label','Mostrar mascota');
const speech=document.createElement('span');
speech.className='ally-pet-speech';speech.setAttribute('role','status');speech.setAttribute('aria-live','polite');
const sound=document.createElement('button');
sound.type='button';sound.className='ally-pet-sound';
root.append(pet,sound,hide,restore,speech);document.body.append(root);
const synth=window.speechSynthesis;
const canSpeak=!!(synth&&window.SpeechSynthesisUtterance);
let voiceEnabled=true,activeUtterance=null,voiceTimer;
try{voiceEnabled=localStorage.getItem('ally-community-voice')!=='off';}catch{}
function updateSound(){
  sound.textContent=canSpeak&&voiceEnabled?'🔊':'🔇';
  sound.disabled=!canSpeak;
  sound.setAttribute('aria-pressed',String(canSpeak&&voiceEnabled));
  const label=!canSpeak?'Voz no disponible en este navegador':voiceEnabled?'Silenciar voz de Ally':'Activar voz de Ally';
  sound.setAttribute('aria-label',label);sound.title=label;
}
function spanishVoice(){
  if(!canSpeak)return null;
  const voices=synth.getVoices().filter(v=>/^es(?:[-_]|$)/i.test(v.lang));
  const score=v=>(/^es[-_]ES$/i.test(v.lang)?8:0)+(v.localService?4:0)+(/natural|enhanced|premium|neural/i.test(v.name)?2:0);
  return voices.sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name))[0]||null;
}
function stopVoice(){
  clearTimeout(voiceTimer);
  if(activeUtterance){activeUtterance=null;synth.cancel();}
  root.removeAttribute('data-speaking');
}
function speak(message){
  if(!canSpeak||!voiceEnabled||document.hidden||muted||document.querySelector('dialog[open]'))return;
  stopVoice();
  const voice=spanishVoice();
  if(!voice)return; // Never fall back to an unrelated language.
  const u=new SpeechSynthesisUtterance(message);
  u.voice=voice;u.lang=voice.lang;u.pitch=1.12;u.rate=1.07;u.volume=.65;
  activeUtterance=u;
  u.onstart=()=>{if(activeUtterance===u){root.setAttribute('data-speaking','');clearTimeout(speechTimer);}};
  const done=()=>{if(activeUtterance!==u)return;clearTimeout(voiceTimer);activeUtterance=null;root.removeAttribute('data-speaking');clearTimeout(speechTimer);speechTimer=setTimeout(clearSpeech,650);};
  u.onend=done;u.onerror=done;
  voiceTimer=setTimeout(()=>{if(activeUtterance===u){stopVoice();clearSpeech();}},8500);
  try{synth.speak(u);}catch{done();}
}
if(canSpeak){synth.getVoices();synth.addEventListener?.('voiceschanged',updateSound);}
updateSound();
sound.addEventListener('click',()=>{
  voiceEnabled=!voiceEnabled;
  try{localStorage.setItem('ally-community-voice',voiceEnabled?'on':'off');}catch{}
  updateSound();activity();
  if(voiceEnabled){animate('wave','¡Hola! Soy Ally. ¡Vamos a jugar!');}
  else{stopVoice();say('¡Modo silencio!',false);}
});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const reactions=[
 ['bounce','¡Boing! ¡Qué salto!'],['spin','¡Ally al rescate!'],['dance','¡Modo fiesta! ¡Vamos allá!'],
 ['squish','¡Je, je! ¡Eso hace cosquillas!'],['wave','¡Hola, comandante!'],['heart','¡Un puntito más de amistad!']
];
let position={x:1,y:1},drag=null,muted=false,lastAction=Date.now(),speechTimer,idleTimer,index=0,suppressUntil=0;
try{const saved=JSON.parse(sessionStorage.getItem('ally-community-pet')||'null');if(saved){if(Number.isFinite(saved.x)&&Number.isFinite(saved.y))position={x:Math.max(0,Math.min(1,saved.x)),y:Math.max(0,Math.min(1,saved.y))};muted=saved.hidden===true;}}catch{}
function save(){try{sessionStorage.setItem('ally-community-pet',JSON.stringify({...position,hidden:muted}));}catch{}}
function bounds(){return {x:Math.max(0,document.documentElement.clientWidth-root.offsetWidth-24),y:Math.max(0,window.innerHeight-root.offsetHeight-24)};}
function paint(){const b=bounds();root.style.left=(12+position.x*b.x)+'px';root.style.top=(12+position.y*b.y)+'px';root.toggleAttribute('data-left',position.x<.5);root.toggleAttribute('data-top',position.y<.35);}
function move(x,y){const b=bounds();position={x:b.x?Math.max(0,Math.min(1,(x-12)/b.x)):0,y:b.y?Math.max(0,Math.min(1,(y-12)/b.y)):0};paint();}
function clearSpeech(){speech.classList.remove('visible');speech.textContent='';}
function say(message,audible=true){clearTimeout(speechTimer);speech.textContent=message;speech.classList.add('visible');speechTimer=setTimeout(clearSpeech,3500);if(audible)speak(message);}
function animate(name,message=''){img.removeAttribute('data-reaction');void img.offsetWidth;if(!reduced.matches)img.dataset.reaction=name;if(message)say(message);}
function activity(){lastAction=Date.now();}
function setHidden(value,focus=false){muted=value;if(value)stopVoice();root.toggleAttribute('data-minimized',value);speech.classList.remove('visible');speech.textContent='';img.removeAttribute('data-reaction');paint();save();if(focus)(value?restore:pet).focus({preventScroll:true});}
pet.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;const rect=root.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top,moved:false};pet.setPointerCapture(e.pointerId);activity();});
pet.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<7)return;if(!drag.moved)stopVoice();drag.moved=true;root.setAttribute('data-dragging','');img.removeAttribute('data-reaction');speech.classList.remove('visible');move(drag.left+dx,drag.top+dy);});
function finish(e,cancel=false){if(!drag||drag.id!==e.pointerId)return;const moved=drag.moved;drag=null;root.removeAttribute('data-dragging');if(moved){suppressUntil=performance.now()+400;save();if(!cancel)animate('land');}activity();}
pet.addEventListener('pointerup',e=>finish(e));
pet.addEventListener('pointercancel',e=>finish(e,true));
pet.addEventListener('lostpointercapture',e=>finish(e,true));
pet.addEventListener('click',e=>{if(e.detail!==0&&performance.now()<suppressUntil)return;activity();const [name,msg]=reactions[index++%reactions.length];animate(name,msg);});
pet.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();position={x:1,y:1};paint();save();return;}if(!e.shiftKey)return;const delta={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[e.key];if(!delta)return;e.preventDefault();const r=root.getBoundingClientRect();move(r.left+delta[0],r.top+delta[1]);save();activity();});
hide.addEventListener('click',()=>setHidden(true,true));
restore.addEventListener('click',()=>{setHidden(false,true);activity();animate('wave','¡He vuelto!');});
img.addEventListener('animationend',()=>img.removeAttribute('data-reaction'));
window.addEventListener('resize',paint,{passive:true});
function idle(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(!muted&&!drag&&!document.hidden&&!reduced.matches&&!document.querySelector('dialog[open]')&&Date.now()-lastAction>28000){animate(['wave','bounce','dance'][Math.floor(Math.random()*3)]);activity();}idle();},35000+Math.random()*18000);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopVoice();clearSpeech();}activity();idle();});
const dialog=document.querySelector('#modal');
if(dialog)new MutationObserver(()=>{if(dialog.open){stopVoice();clearSpeech();}}).observe(dialog,{attributes:true,attributeFilter:['open']});
window.addEventListener('pagehide',stopVoice);
setHidden(muted);idle();

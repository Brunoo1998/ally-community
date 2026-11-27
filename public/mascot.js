// Ally Community's independent, local-only interactive mascot.
const root=document.createElement('aside');
root.className='ally-pet';
root.setAttribute('aria-label','Mascota de Ally Community');
const pet=document.createElement('button');
pet.type='button';pet.className='ally-pet-button';
pet.setAttribute('aria-label','Jugar con Ally. Toca, toca dos veces, mantén pulsado o arrastra. Mayús y flechas para moverla.');
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
const effect=document.createElement('span');
effect.className='ally-pet-effect';effect.setAttribute('aria-hidden','true');
root.append(pet,sound,hide,restore,speech,effect);document.body.append(root);
const synth=window.speechSynthesis;
const canSpeak=!!(synth&&window.SpeechSynthesisUtterance);
let voiceEnabled=true,activeUtterance=null,voiceTimer,robotContext;
let robotTones=[];
function stopRobotTone(){
  for(const node of robotTones){try{node.stop();}catch{}}
  robotTones=[];
}
function robotTone(){
  // Short electronic acknowledgement; the speech itself uses the system voice.
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;
  try{
    robotContext??=new AC();
    const ctx=robotContext;
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    const now=ctx.currentTime;
    for(const [offset,freq] of [[0,220],[.055,330]]){
      const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
      o.type='triangle';o.frequency.setValueAtTime(freq,now+offset);
      f.type='lowpass';f.frequency.value=740;
      g.gain.setValueAtTime(.0001,now+offset);g.gain.exponentialRampToValueAtTime(.028,now+offset+.008);g.gain.exponentialRampToValueAtTime(.0001,now+offset+.05);
      o.connect(f);f.connect(g);g.connect(ctx.destination);
      robotTones.push(o);o.onended=()=>{o.disconnect();f.disconnect();g.disconnect();robotTones=robotTones.filter(n=>n!==o);};
      o.start(now+offset);o.stop(now+offset+.055);
    }
  }catch{}
}
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
  // Web Speech does not expose gender: prefer known masculine voice names.
  const masculine=/\b(male|masculin[oa]|pablo|álvaro|alvaro|jorge|diego|carlos|enrique|antonio|miguel|juan|andrés|andres|raul|raúl|mateo|dario|darío|rodrigo|gonzalo|felipe|luis|pedro|sergio|javier|josé|jose|martín|martin|manuel|francisco|iván|ivan|ramón|ramon)\b/i;
  const feminine=/\b(female|femenin[oa]|helena|mónica|monica|laura|lucía|lucia|elvira|paulina|sabina|camila|paloma|maria|maría|carmen|isabel|sonia|ana|andrea|valentina|carolina|sofia|sofía|natalia)\b/i;
  const score=v=>(masculine.test(v.name)?100:0)-(feminine.test(v.name)?30:0)+(/^es[-_]ES$/i.test(v.lang)?20:0)+(v.localService?4:0)+(/natural|enhanced|premium|neural/i.test(v.name)?2:0);
  return voices.sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name))[0]||null;
}
function stopVoice(){
  clearTimeout(voiceTimer);
  stopRobotTone();
  if(activeUtterance){activeUtterance=null;synth.cancel();}
  root.removeAttribute('data-speaking');
}
function speak(message){
  if(!canSpeak||!voiceEnabled||document.hidden||muted||document.querySelector('dialog[open]'))return;
  stopVoice();
  const voice=spanishVoice();
  if(!voice)return; // Never fall back to an unrelated language.
  const u=new SpeechSynthesisUtterance(message);
  u.voice=voice;u.lang=voice.lang;u.pitch=.89;u.rate=1.08;u.volume=.65;
  activeUtterance=u;
  u.onstart=()=>{if(activeUtterance===u){root.setAttribute('data-speaking','');clearTimeout(speechTimer);}};
  const done=()=>{if(activeUtterance!==u)return;clearTimeout(voiceTimer);activeUtterance=null;root.removeAttribute('data-speaking');clearTimeout(speechTimer);speechTimer=setTimeout(clearSpeech,650);};
  u.onend=done;u.onerror=done;
  voiceTimer=setTimeout(()=>{if(activeUtterance===u){stopVoice();clearSpeech();}},8500);
  try{synth.speak(u);robotTone();}catch{done();}
}
if(canSpeak){synth.getVoices();synth.addEventListener?.('voiceschanged',updateSound);}
updateSound();
sound.addEventListener('click',()=>{
  voiceEnabled=!voiceEnabled;
  try{localStorage.setItem('ally-community-voice',voiceEnabled?'on':'off');}catch{}
  updateSound();activity();
  if(voiceEnabled){animate('wave','¡Bip, bip! ¡Hola, colega! Soy Ally. ¡Vamos a pasarlo genial!');}
  else{stopVoice();say('¡Modo silencio!',false);}
});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const reactions=[
 ['bounce','¡Bip, bip! ¡Yuju, qué salto!','✦'],
 ['spin','¡Uuuy! ¡Mis circuitos están dando vueltas!','★'],
 ['dance','¡Modo fiesta! ¡Mira cómo bailo!','♫'],
 ['squish','¡Ja, ja! ¡Me haces cosquillas en los tornillos!','✧'],
 ['wave','¡Ey, colega! ¡Qué alegría verte!','✋'],
 ['heart','¡Amistad al máximo! ¡Choca esos cinco!','♥'],
 ['rocket','¡Tres, dos, uno! ¡Despegamos!','🚀'],
 ['wobble','¡Uy! ¡Se me ha aflojado un tornillo!','⚙'],
 ['charge','¡Batería al cien por cien! ¡A tope!','⚡'],
 ['peek','¡Cucú! ¿Me echabas de menos?','?'],
 ['victory','¡Logro desbloqueado! ¡Colega legendario!','★'],
 ['laugh','¡Ja, ja! ¡Mis circuitos no pueden más!','✦'],
 ['float','¡Mira, sin tocar el suelo!','✧'],
 ['sleep','¡Cinco minutitos más! Bueno, mejor no.','Zz'],
 ['shake','¡Activando el modo terremoto!','⚡'],
 ['bow','¡Muchas gracias, público maravilloso!','♥']
];
let bag=[],lastReaction='',lastTap=-Infinity,tapStreak=0,gestureUntil=0,gesture=null,holdTimer,hoverAt=-Infinity,effectTimer,idleIndex=0;
function randomReaction(){
  if(!bag.length){
    bag=reactions.slice();
    for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
    if(bag[bag.length-1][0]===lastReaction)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];
  }
  const choice=bag.pop();lastReaction=choice[0];return choice;
}
function clearEffect(){clearTimeout(effectTimer);effect.classList.remove('visible');effect.textContent='';}
function showEffect(symbol){clearEffect();if(!symbol||reduced.matches)return;effect.textContent=symbol;void effect.offsetWidth;effect.classList.add('visible');effectTimer=setTimeout(clearEffect,1150);}
function reaction(name,message,symbol){animate(name,message);showEffect(symbol);}
function resetGesture(){clearTimeout(holdTimer);root.removeAttribute('data-holding');}
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
function setHidden(value,focus=false){muted=value;if(value){stopVoice();resetGesture();clearEffect();}root.toggleAttribute('data-minimized',value);speech.classList.remove('visible');speech.textContent='';img.removeAttribute('data-reaction');paint();save();if(focus)(value?restore:pet).focus({preventScroll:true});}
pet.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0)return;
  resetGesture();gesture=null;
  const rect=root.getBoundingClientRect();
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top,moved:false,started:performance.now(),lastX:e.clientX,lastY:e.clientY,lastTime:performance.now(),speed:0};
  pet.setPointerCapture(e.pointerId);activity();
  holdTimer=setTimeout(()=>{if(drag&&!drag.moved){root.setAttribute('data-holding','');if(!reduced.matches){img.removeAttribute('data-reaction');void img.offsetWidth;img.dataset.reaction='charge';}showEffect('⚡');}},520);
});
pet.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<7)return;
  if(!drag.moved){stopVoice();resetGesture();clearEffect();}
  const now=performance.now(),dt=Math.max(16,now-drag.lastTime);
  drag.speed=Math.hypot(e.clientX-drag.lastX,e.clientY-drag.lastY)/dt;
  drag.lastX=e.clientX;drag.lastY=e.clientY;drag.lastTime=now;
  drag.moved=true;root.setAttribute('data-dragging','');
  root.toggleAttribute('data-fast',drag.speed>1.0);img.removeAttribute('data-reaction');clearSpeech();move(drag.left+dx,drag.top+dy);
});
function finish(e,cancel=false){
  if(!drag||drag.id!==e.pointerId)return;
  const d=drag;drag=null;resetGesture();root.removeAttribute('data-dragging');root.removeAttribute('data-fast');
  const duration=performance.now()-d.started;
  if(d.moved){
    suppressUntil=performance.now()+500;gesture=null;save();
    if(!cancel){
      const speedy=d.speed>1.0&&performance.now()-d.lastTime<170;
      if(speedy)reaction('wobble','¡Uuuy! ¡Eso sí que ha sido un viaje!','✦');
      else reaction('land','¡Aterrizaje perfecto, colega!','★');
    }
  }else if(!cancel&&duration>=520){
    gesture='hold';gestureUntil=performance.now()+900;
  }else if(cancel){gesture=null;suppressUntil=performance.now()+350;img.removeAttribute('data-reaction');clearEffect();}
  activity();
}
pet.addEventListener('pointerup',e=>finish(e));
pet.addEventListener('pointercancel',e=>finish(e,true));
pet.addEventListener('lostpointercapture',e=>finish(e,true));
pet.addEventListener('contextmenu',e=>e.preventDefault());
pet.addEventListener('click',e=>{
  const now=performance.now();
  if(e.detail!==0&&now<suppressUntil)return;
  activity();
  if(gesture==='hold'&&now<gestureUntil){gesture=null;lastTap=-Infinity;tapStreak=0;reaction('charge','¡Carga completa! ¡Ally turbo activado!','⚡');return;}
  gesture=null;
  tapStreak=now-lastTap<390?tapStreak+1:1;lastTap=now;
  if(tapStreak===2){reaction('dance','¡Doble toque! ¡Que empiece la fiesta!','♫');return;}
  if(tapStreak>=3){tapStreak=0;lastTap=-Infinity;reaction('victory','¡Combo de tres! ¡Eres una máquina!','🏆');return;}
  reaction(...randomReaction());
});
pet.addEventListener('pointerenter',e=>{
  if(e.pointerType!=='mouse'||drag||muted||reduced.matches||activeUtterance||performance.now()-hoverAt<16000)return;
  hoverAt=performance.now();animate('peek');showEffect('✧');activity();
});
pet.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();position={x:1,y:1};paint();save();return;}if(!e.shiftKey)return;const delta={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[e.key];if(!delta)return;e.preventDefault();const r=root.getBoundingClientRect();move(r.left+delta[0],r.top+delta[1]);save();activity();});
hide.addEventListener('click',()=>setHidden(true,true));
restore.addEventListener('click',()=>{setHidden(false,true);activity();animate('wave','¡Tachán! ¡Tu robot favorito ha vuelto!');});
img.addEventListener('animationend',()=>img.removeAttribute('data-reaction'));
window.addEventListener('resize',paint,{passive:true});
function idle(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(!muted&&!drag&&!activeUtterance&&!document.hidden&&!reduced.matches&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,textarea,select,[contenteditable=true]')&&Date.now()-lastAction>24000){const idleMoves=['peek','float','sleep','wave','dance','charge','bow','shake'];const name=idleMoves[idleIndex++%idleMoves.length];animate(name);if(name==='sleep')showEffect('Zz');else if(name==='charge')showEffect('⚡');activity();}idle();},28000+Math.random()*20000);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopVoice();clearSpeech();clearEffect();resetGesture();}activity();idle();});
const dialog=document.querySelector('#modal');
if(dialog)new MutationObserver(()=>{if(dialog.open){stopVoice();clearSpeech();clearEffect();resetGesture();}}).observe(dialog,{attributes:true,attributeFilter:['open']});
window.addEventListener('pagehide',()=>{stopVoice();clearEffect();resetGesture();clearTimeout(idleTimer);});
setHidden(muted);idle();

import {dragLines,landLines,landingMood,dragMode,createPhrasePicker,gamingLines,createGamingSequence} from './mascot-motion.js?v=2';
// Ally Community's independent, local-only interactive mascot.
const root=document.createElement('aside');
root.className='ally-pet';
root.setAttribute('aria-label','Mascota de Ally Community');
const pet=document.createElement('button');
pet.type='button';pet.className='ally-pet-button';
pet.setAttribute('aria-label','Jugar con Ally. Toca, toca dos veces, toca tres veces para ver a Ally jugar, mantén pulsado o arrastra. Mayús y flechas para moverla.');
const img=document.createElement('img');
img.src='/ally.webp';img.alt='';img.draggable=false;img.width=64;img.height=64;
pet.append(img);
const consoleProp=document.createElement('span');
consoleProp.className='ally-pet-console';
consoleProp.setAttribute('aria-hidden','true');
// One illustrated rig: wrists behind the shell, curled fingers in front of its edges.
const consoleArt=document.createElement('img');
consoleArt.className='ally-console-back';consoleArt.src='/ally-handheld.svg?v=grip-3';consoleArt.alt='';consoleArt.draggable=false;
consoleProp.append(consoleArt);pet.append(consoleProp);
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
  if(voiceEnabled){endGaming();animate('wave','¡Bip, bip! ¡Hola, colega! Soy Ally. ¡Vamos a pasarlo genial!');}
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
let greetedProfile=false,bag=[],lastReaction='',lastTap=-Infinity,tapStreak=0,gestureUntil=0,gesture=null,holdTimer,hoverAt=-Infinity,effectTimer,idleIndex=0;
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
const gamingSequence=createGamingSequence({
  stage(stage){root.setAttribute('data-gaming',stage);},
  finish(){
    root.removeAttribute('data-gaming');
    if(!muted&&!document.hidden&&!document.querySelector('dialog[open]')){
      animate('victory');showEffect('★');activity();
    }
  },
  line(stage){
    if(muted||document.hidden||document.querySelector('dialog[open]'))return;
    if(stage==='playing'&&activeUtterance)return;
    const message=pickMotion('gaming-'+stage,gamingLines[stage]);
    say(message,stage!=='win'||!activeUtterance);
    if(stage==='win')showEffect('★');
  }
});
function endGaming(){
  gamingSequence.cancel();
  root.removeAttribute('data-gaming');
}
function startGaming(){
  endGaming();stopVoice();clearEffect();clearSpeech();
  img.removeAttribute('data-reaction');
  void consoleProp.offsetWidth;
  activity();
  gamingSequence.start();
}
function reaction(name,message,symbol){endGaming();animate(name,message);showEffect(symbol);}
const pickMotion=createPhrasePicker();
function resetGesture(){clearTimeout(holdTimer);root.removeAttribute('data-holding');}
function resetDragVisuals(){
  root.removeAttribute('data-dragging');root.removeAttribute('data-fast');
  root.removeAttribute('data-drag-mode');root.removeAttribute('data-drag-side');
}
function abortDrag(){
  if(!drag)return;
  const id=drag.id;drag=null;resetGesture();resetDragVisuals();gesture=null;
  suppressUntil=performance.now()+500;stopVoice();clearSpeech();clearEffect();
  if(pet.hasPointerCapture?.(id))try{pet.releasePointerCapture(id);}catch{}
  save();
}
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
function setHidden(value,focus=false){muted=value;if(value){abortDrag();endGaming();stopVoice();resetGesture();clearEffect();}root.toggleAttribute('data-minimized',value);speech.classList.remove('visible');speech.textContent='';img.removeAttribute('data-reaction');paint();save();if(focus)(value?restore:pet).focus({preventScroll:true});}
pet.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0)return;
  if(drag)return;
  resetGesture();gesture=null;
  if(root.hasAttribute('data-gaming')){endGaming();stopVoice();clearSpeech();}
  const rect=root.getBoundingClientRect();
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top,moved:false,started:performance.now(),lastX:e.clientX,lastY:e.clientY,lastTime:performance.now(),speed:0,vx:0,vy:0,distance:0,phrases:0,lastPhrase:0};
  pet.setPointerCapture(e.pointerId);activity();
  holdTimer=setTimeout(()=>{if(drag&&!drag.moved){root.setAttribute('data-holding','');if(!reduced.matches){img.removeAttribute('data-reaction');void img.offsetWidth;img.dataset.reaction='charge';}showEffect('⚡');}},520);
});
pet.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<7)return;
  const firstMove=!drag.moved;
  if(firstMove){stopVoice();resetGesture();clearEffect();clearSpeech();img.removeAttribute('data-reaction');}
  const now=performance.now(),dt=Math.max(16,now-drag.lastTime);
  const stepX=e.clientX-drag.lastX,stepY=e.clientY-drag.lastY;
  drag.vx=stepX/dt;drag.vy=stepY/dt;
  drag.speed=Math.hypot(stepX,stepY)/dt;
  drag.distance+=Math.hypot(stepX,stepY);
  drag.lastX=e.clientX;drag.lastY=e.clientY;drag.lastTime=now;
  drag.moved=true;root.setAttribute('data-dragging','');
  const mode=dragMode(drag);
  root.dataset.dragMode=mode;
  if(Math.abs(drag.vx)>.12)root.dataset.dragSide=drag.vx<0?'left':'right';
  root.toggleAttribute('data-fast',mode==='fast');
  move(drag.left+dx,drag.top+dy);
  if(firstMove){
    drag.phrases=1;drag.lastPhrase=now;
    say(pickMotion('lift',dragLines.lift));
  }else if(drag.phrases<2&&now-drag.lastPhrase>4800&&!activeUtterance){
    const type=mode==='fast'?'fast':'cruise';
    drag.phrases++;drag.lastPhrase=now;
    say(pickMotion(type,dragLines[type]));
  }
});
function finish(e,cancel=false){
  if(!drag||drag.id!==e.pointerId)return;
  const d=drag;drag=null;resetGesture();resetDragVisuals();
  const duration=performance.now()-d.started;
  if(d.moved){
    suppressUntil=performance.now()+500;gesture=null;lastTap=-Infinity;tapStreak=0;save();
    stopVoice();clearSpeech();clearEffect();
    if(!cancel){
      const mood=landingMood(d,performance.now(),position);
      reaction(...pickMotion('landing-'+mood,landLines[mood]));
    }else img.removeAttribute('data-reaction');
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
  if(tapStreak>=3){tapStreak=0;lastTap=-Infinity;startGaming();return;}
  if(!greetedProfile&&document.body.dataset.allyProfile){greetedProfile=true;reaction('wave','¡Ey, '+document.body.dataset.allyProfile+'! ¡Qué alegría verte, colega!','♥');return;}
  reaction(...randomReaction());
});
pet.addEventListener('pointerenter',e=>{
  if(e.pointerType!=='mouse'||drag||muted||reduced.matches||activeUtterance||root.hasAttribute('data-gaming')||performance.now()-hoverAt<16000)return;
  hoverAt=performance.now();animate('peek');showEffect('✧');activity();
});
pet.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();position={x:1,y:1};paint();save();return;}if(!e.shiftKey)return;const delta={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[e.key];if(!delta)return;e.preventDefault();const r=root.getBoundingClientRect();move(r.left+delta[0],r.top+delta[1]);save();activity();});
hide.addEventListener('click',()=>setHidden(true,true));
restore.addEventListener('click',()=>{setHidden(false,true);activity();animate('wave','¡Tachán! ¡Tu robot favorito ha vuelto!');});
img.addEventListener('animationend',()=>img.removeAttribute('data-reaction'));
window.addEventListener('resize',paint,{passive:true});
function idle(){clearTimeout(idleTimer);if(document.hidden||reduced.matches)return;idleTimer=setTimeout(()=>{if(!muted&&!drag&&!activeUtterance&&!root.hasAttribute('data-gaming')&&!document.hidden&&!reduced.matches&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,textarea,select,[contenteditable=true]')&&Date.now()-lastAction>24000){const idleMoves=['peek','float','sleep','wave','dance','charge','bow','shake'];const name=idleMoves[idleIndex++%idleMoves.length];animate(name);if(name==='sleep')showEffect('Zz');else if(name==='charge')showEffect('⚡');activity();}idle();},28000+Math.random()*20000);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){abortDrag();endGaming();stopVoice();clearSpeech();clearEffect();resetGesture();}activity();idle();});
reduced.addEventListener('change',()=>{if(reduced.matches){endGaming();clearEffect();img.removeAttribute('data-reaction');}activity();idle();});
const dialog=document.querySelector('#modal');
if(dialog)new MutationObserver(()=>{if(dialog.open){abortDrag();endGaming();stopVoice();clearSpeech();clearEffect();resetGesture();}}).observe(dialog,{attributes:true,attributeFilter:['open']});
window.addEventListener('pagehide',()=>{abortDrag();endGaming();stopVoice();clearEffect();resetGesture();clearTimeout(idleTimer);});
setHidden(muted);idle();

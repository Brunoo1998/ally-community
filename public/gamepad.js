let direction='', next=0;
const vectors={12:[0,-1],13:[0,1],14:[-1,0],15:[1,0]};
function focus(dx,dy){
  const scope=document.querySelector('dialog[open]')||document;
  const candidates=[...scope.querySelectorAll('a[href],summary,button,input,textarea,select')].filter(e=>!e.disabled&&e.getClientRects().length);
  const active=document.activeElement;
  const target=!candidates.includes(active)?candidates[0]:candidates.reduce((best,node)=>{
    const a=active.getBoundingClientRect(), b=node.getBoundingClientRect();
    const x=b.x+b.width/2-a.x-a.width/2,y=b.y+b.height/2-a.y-a.height/2;
    const step=x*dx+y*dy;
    if(step<=5)return best;
    const distance=step+Math.abs(x*dy-y*dx)*3;
    return !best||distance<best.distance?{node,distance}:best;
  },null)?.node;
  if(target){
    active?.classList.remove('pad-focus');
    target.classList.add('pad-focus');
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'nearest'});
  }
}
let poll;
function scan(){
  if(document.hidden)return;
  const pad=[...navigator.getGamepads()].find(x=>x?.mapping==='standard');
  if(!pad)return;
  const key=[0,1,12,13,14,15].find(i=>pad.buttons[i]?.pressed);
  if(key===undefined){direction='';return;}
  if(key===direction&&(!vectors[key]||performance.now()<next))return;
  next=performance.now()+(key===direction?135:340);
  direction=key;
  const active=document.activeElement;
  if(vectors[key])focus(...vectors[key]);
  else if(key===1)document.querySelector('dialog[open]')?.close();
  else if(active.matches('input:not([type=checkbox]),textarea'))navigator.virtualKeyboard?.show?.();
  else active.click();
}
function sync(){
  if(!navigator.getGamepads)return;
  if(!document.hidden&&[...navigator.getGamepads()].some(x=>x?.mapping==='standard')){
    poll??=setInterval(scan,50);
  }else{clearInterval(poll);poll=undefined;direction='';}
}
window.addEventListener('gamepadconnected',sync);
window.addEventListener('gamepaddisconnected',sync);
document.addEventListener('visibilitychange',sync);
document.addEventListener('pointerdown',()=>document.querySelector('.pad-focus')?.classList.remove('pad-focus'));
sync();

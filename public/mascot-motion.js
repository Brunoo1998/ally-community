// Ally's local drag and landing reactions; no network or new stored data.
export const dragLines={
 lift:[
  '¡Ey, piloto! ¿A dónde vamos?',
  '¡Bip, bip! ¡Servicio de transporte activado!',
  '¡Agárrame bien, que mis tornillos son delicados!',
  '¡Allá vamos! Tú llevas los mandos.',
  '¡Oh! ¡Taxi para robots!'
 ],
 cruise:[
  '¡Qué vistas desde aquí arriba!',
  '¡Modo pasajero activado!',
  '¡Este paseo tiene buenos FPS!',
  '¡Me siento como un dron con patas!',
  '¡Mira, mis circuitos están de vacaciones!'
 ],
 fast:[
  '¡Turbo activado! ¡Sujeta los tornillos!',
  '¡Uuuy! ¡Esto sí que es velocidad!',
  '¡Mis circuitos están en modo carreras!',
  '¡Bip, bip! ¡Control de estabilidad activado!',
  '¡Cuidado, que no tengo cinturón!'
 ]
};
export const landLines={
 gentle:[
  ['soft-land','¡Aterrizaje de diez, piloto!','★'],
  ['stretch','¡Ahhh! ¡Mis articulaciones lo agradecen!','✧'],
  ['salute-land','¡Gracias por el paseo, colega!','♥'],
  ['happy-hop','¡Tachán! ¡Ally en su nueva base!','♫'],
  ['land','¡Perfecto! ¡Aquí estoy de lujo!','★']
 ],
 fast:[
  ['gyro-land','¡Uuuy! ¡Recalibrando giroscopio!','⚙'],
  ['brake-land','¡Frenos de emergencia activados!','⚡'],
  ['spin-land','¡Madre mía! ¡Veo tornillos dando vueltas!','✦'],
  ['wobble','¡Creo que me he dejado un tornillo por el camino!','⚙'],
  ['bounce','¡Qué viaje! ¡Sigo en una pieza!','★']
 ],
 long:[
  ['rest-land','¡Fin de trayecto! ¡Necesito recargar!','Zz'],
  ['victory','¡Logro desbloqueado: vuelta al foro!','🏆'],
  ['stretch','¡Uf! ¡Un descansito para mis circuitos!','✧'],
  ['salute-land','¡Gracias por la excursión, colega!','♥'],
  ['happy-hop','¡Nueva zona descubierta! ¡Mola!','★']
 ],
 edge:[
  ['peek-land','¡Cucú! ¡Qué buen escondite!','?'],
  ['magnet-land','¡Base magnética encontrada!','⚡'],
  ['salute-land','¡Puesto de vigilancia listo!','★'],
  ['soft-land','¡Me quedo en este rinconcito, colega!','♥']
 ]
};
// A fast release takes priority; a brief pause before release is not a throw.
export function landingMood({speed,lastTime,started,distance},now,position){
  if(speed>1.0&&now-lastTime<170)return 'fast';
  if(now-started>3800||distance>1100)return 'long';
  if(position.x<.035||position.x>.965||position.y<.035||position.y>.965)return 'edge';
  return 'gentle';
}
export function dragMode({speed,vx,vy}){
  if(speed>1.0)return 'fast';
  if(Math.abs(vy)>Math.abs(vx)*1.3)return vy<0?'up':'down';
  if(Math.abs(vx)>.12)return vx<0?'left':'right';
  return 'cruise';
}
// Per-pool shuffle bags, plus global last-message avoidance.
export function createPhrasePicker(random=Math.random){
  const bags=new Map();let previous='';
  return (key,choices)=>{
    const label=v=>Array.isArray(v)?v[1]:v;
    let bag=bags.get(key);
    if(!bag?.length){
      bag=choices.slice();
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      bags.set(key,bag);
    }
    const last=bag.length-1;
    if(last>0&&label(bag[last])===previous)[bag[last],bag[0]]=[bag[0],bag[last]];
    const selected=bag.pop();previous=label(selected);return selected;
  };
}

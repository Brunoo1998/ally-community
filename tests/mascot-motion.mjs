import assert from 'node:assert/strict';
import {dragLines,landLines,dragMode,landingMood,createPhrasePicker} from '../public/mascot-motion.js';
const d={started:0,lastTime:900,speed:.2,distance:100};
assert.equal(landingMood(d,1000,{x:.5,y:.5}),'gentle');
assert.equal(landingMood({...d,speed:2},1000,{x:.5,y:.5}),'fast');
assert.equal(landingMood({...d,speed:2},1500,{x:.5,y:.5}),'gentle');
assert.equal(landingMood({...d,distance:1300},1500,{x:.5,y:.5}),'long');
assert.equal(landingMood({...d,lastTime:3900},4000,{x:.5,y:.5}),'long');
assert.equal(landingMood(d,1000,{x:.01,y:.5}),'edge');
for(const [vx,vy,expected] of [[-.5,0,'left'],[.5,0,'right'],[0,-.5,'up'],[0,.5,'down'],[0,0,'cruise'],[2,0,'fast']])assert.equal(dragMode({vx,vy,speed:Math.hypot(vx,vy)}),expected);
const pick=createPhrasePicker(()=>.4);
for(const [key,choices] of Object.entries(dragLines)){
 const items=choices.map(()=>pick(key,choices));
 assert.equal(new Set(items).size,choices.length);
 assert.notEqual(pick(key,choices),items.at(-1));
}
for(const [key,choices] of Object.entries(landLines)){
 const items=choices.map(()=>pick('land-'+key,choices));
 assert.equal(new Set(items.map(v=>v[1])).size,choices.length);
 assert.notEqual(pick('land-'+key,choices)[1],items.at(-1)[1]);
}
assert.equal(Object.values(dragLines).flat().length,15);
assert.equal(Object.values(landLines).flat().length,19);
console.log('Ally: dirección, velocidad, tipo de aterrizaje y rotación de frases correctos.');

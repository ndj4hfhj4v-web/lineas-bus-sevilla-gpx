const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/app.js','utf8');
const code=app.slice(app.indexOf('function roundedScaleMetres('),app.indexOf('function updateStopMarkerSizes('));const ctx={};vm.runInNewContext(code,ctx);
assert(app.includes('zoomSnap:0'),'Allow fractional zoom');
const map={zoom:16,getSize:()=>({y:844}),containerPointToLatLng:p=>p,distance(){return 200*2**(16-this.zoom);},getZoom(){return this.zoom;},getMinZoom:()=>0,getMaxZoom:()=>19,setZoom(z,options){assert.equal(options.animate,false);this.zoom=z;}};
for(const expected of [150,100,90,80,70]){ctx.changeMetricZoom(map,-10);assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),expected);}
for(const expected of [80,90,100,150,200]){ctx.changeMetricZoom(map,10);assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),expected);}
for(let i=0;i<100;i++){ctx.changeMetricZoom(map,-10);ctx.changeMetricZoom(map,10);}assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),200,'No rounding drift');
map.zoom=16+Math.log2(200/130);ctx.changeMetricZoom(map,-10);assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),100,'Crossing the threshold stops at 100 m');map.zoom=16+Math.log2(200/120);ctx.changeMetricZoom(map,10);assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),170,'A gesture can select intermediate values above 100 m');assert.equal(ctx.roundedScaleMetres(114),110);assert.equal(ctx.roundedScaleMetres(126),130);
for(let i=0;i<30;i++)ctx.changeMetricZoom(map,-10);assert(map.zoom<=19,'Respect map maximum');
map.zoom=0;ctx.changeMetricZoom(map,10);assert.equal(map.zoom,0,'Respect map minimum');
assert.equal(ctx.roundedScaleMetres(199.999999),200);assert.equal(ctx.roundedScaleMetres(190.000001),190);
console.log('Correcto: pasos de 10 m hasta 100 m y de 50 m por encima, gesto libre con escala de 10 m, sin deriva y con límites del mapa.');

const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
map.on=()=>{};const makeButton=()=>({dataset:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,v){this.events[k]=v;}});
let holdCallback=null,clock=10000;ctx.setTimeout=fn=>{holdCallback=fn;return 1;};ctx.clearTimeout=()=>{holdCallback=null;};ctx.Date={now:()=>clock};
map.zoom=16+Math.log2(200/130);const button=makeButton();ctx.bindFavouriteZoom(button,map,storage);assert.equal(button.dataset.hasFavourite,'false');button.events.click();assert.equal(memory.get('bus-copilot-favourite-zoom-metres'),'130');assert.equal(button.dataset.atFavourite,'true');
map.zoom=16;button.events.click();assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),130,'Restore the saved distance after zooming');
const reopened=makeButton();ctx.bindFavouriteZoom(reopened,map,storage);map.zoom=16;reopened.events.click();assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),130,'Keep favourite across app openings');
map.zoom=16+Math.log2(200/90);reopened.events.pointerdown({button:0,clientX:0,clientY:0});holdCallback();reopened.events.pointerup();reopened.events.click();assert.equal(memory.get('bus-copilot-favourite-zoom-metres'),'90','A long press replaces the favourite');clock+=1500;map.zoom=16;reopened.events.click();assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),90);
reopened.events.pointerdown({button:0,clientX:0,clientY:0});reopened.events.pointermove({clientX:30,clientY:0});assert.equal(holdCallback,null,'Movement cancels long press');
const blocked=makeButton();map.zoom=16;ctx.bindFavouriteZoom(blocked,map,{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});blocked.events.click();map.zoom=17;blocked.events.click();assert.equal(ctx.roundedScaleMetres(ctx.scaleDistanceMetres(map)),200,'Keep an in-memory favourite if storage is blocked');
console.log('Correcto: botón de metros, favorito persistente, recuperación del zoom, cambio con pulsación larga y almacenamiento bloqueado.');

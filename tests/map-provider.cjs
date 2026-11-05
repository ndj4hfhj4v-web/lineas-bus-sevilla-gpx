const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/app.js','utf8');const code=app.slice(app.indexOf('const MAPBOX_PUBLIC_TOKEN='),app.indexOf('const initialMapType='));
module.exports=(async()=>{
 const ctx={console};vm.createContext(ctx);vm.runInContext(code,ctx);
 assert.equal(ctx.mapboxStyle('street',true),'mapbox://styles/mapbox/dark-v11');assert.equal(ctx.mapboxStyle('aerial',true),'mapbox://styles/mapbox/satellite-streets-v12');
 let sdkLoads=0,constructed=0,removed=0,observer,frame;const events={},stored=new Map([['bus-copilot-map-provider','ign']]),timers=new Map();let timer=0;
 const select={value:'ign',addEventListener:(n,fn)=>events['select:'+n]=fn,removeEventListener(){}};const status={textContent:'',hidden:true};const root={dataset:{theme:'day',mapType:'street'}};const hosts=[];
 const win={setTimeout:(fn,ms)=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{frame=fn;return 1;},cancelAnimationFrame:()=>{frame=null;},addEventListener:(n,fn)=>events[n]=fn,removeEventListener(){},MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}};
 const doc={documentElement:root,getElementById:id=>id==='mapProvider'?select:status,createElement:()=>({style:{},setAttribute(){},remove(){this.removed=true;}})};const nav={onLine:true};
 const ign={addTo(m){m.layers.add(this);}};const map={layers:new Set([ign]),zoom:16,bearing:270,center:{lat:37.39,lng:-5.99},attributions:new Set(),getCenter(){return this.center;},getZoom(){return this.zoom;},getBearing(){return this.bearing;},getContainer:()=>({prepend:h=>hosts.push(h)}),hasLayer(layer){return this.layers.has(layer);},removeLayer(layer){this.layers.delete(layer);},on:(n,fn)=>events['map:'+n]=fn,off(){}};map.attributionControl={addAttribution:s=>map.attributions.add(s),removeAttribution:s=>map.attributions.delete(s)};
 let gl;const sdk={supported:()=>true,Map:class{constructor(options){constructed++;this.options=options;this.events={};this.styles=[];this.camera=[];gl=this;}on(n,fn){this.events[n]=fn;}resize(){}jumpTo(c){this.camera.push(c);}setStyle(s){this.styles.push(s);}getStyle(){return {layers:[]};}remove(){removed++;}}};
 let google, googleLoads=0, googleAuthFailure;
 const googleSdk={RenderingType:{VECTOR:'VECTOR'},Map:class {
  constructor(host,options){google=this;this.host=host;this.type=options.mapTypeId;}
  addListener(event,handler){this[event]=handler;}
  getRenderingType(){return 'VECTOR';}
  moveCamera(camera){this.camera=camera;}
  setMapTypeId(type){this.type=type;}
 }};
 const controller=ctx.initMapProvider(map,ign,{window:win,document:doc,navigator:nav,accessToken:'pk.test',storage:()=>({getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}),loadSdk:async()=>{sdkLoads++;return sdk;},googleKey:'test',loadGoogleSdk:async(key,doc,win,onAuthFailure)=>{googleLoads++;googleAuthFailure=onAuthFailure;return googleSdk;}});
 assert.equal(sdkLoads,0,'IGN never loads or bills Mapbox');select.value='mapbox';events['select:change']();for(let i=0;i<8;i++)await Promise.resolve();assert.equal(constructed,1);assert.equal(gl.options.zoom,15);assert.equal(gl.options.bearing,-270);assert.equal(gl.options.interactive,false);assert(map.hasLayer(ign),'Keep IGN until Mapbox renders');gl.events.load();assert(!map.hasLayer(ign));assert.equal(root.dataset.mapProvider,'mapbox');assert.equal(map.attributions.size,1);
 map.zoom=17;map.bearing=180;events['map:move zoom rotate']();frame();assert.equal(gl.camera.at(-1).zoom,16);assert.equal(gl.camera.at(-1).bearing,-180);
 select.value='ign';events['select:change']();assert(map.hasLayer(ign));assert.equal(map.attributions.size,0);select.value='mapbox';events['select:change']();assert.equal(constructed,1,'Reuse the existing Mapbox instance');assert(!map.hasLayer(ign));
 root.dataset.theme='night';observer();assert.equal(gl.styles.at(-1),'mapbox://styles/mapbox/dark-v11');assert(map.hasLayer(ign),'Keep a background while the new style loads');gl.events.idle();root.dataset.mapType='aerial';observer();assert.equal(gl.styles.at(-1),'mapbox://styles/mapbox/satellite-streets-v12');gl.events.idle();assert.equal(map.zoom,17,'Provider and style switches preserve the camera');
 gl.events.error({sourceId:'mapbox-satellite',error:{status:429}});gl.events.idle();assert(map.hasLayer(ign),'A satellite error keeps the IGN aerial layer visible even after idle');assert.match(status.textContent,/vista aérea del IGN/);
 root.dataset.mapType='street';observer();gl.events.idle();assert(!map.hasLayer(ign),'Switching styles recovers Mapbox after a satellite error');
 nav.onLine=false;events.offline();assert(map.hasLayer(ign));assert.equal(root.dataset.mapProvider,'ign');assert.match(status.textContent,/Sin conexión/);assert.equal(select.value,'mapbox','Keep the preferred provider for reconnection');nav.onLine=true;events.online();assert(!map.hasLayer(ign));assert.equal(constructed,1); 
 assert.equal(googleLoads,0,'Google is loaded only when selected');
 select.value='google';events['select:change']();for(let i=0;i<8;i++)await Promise.resolve();
 assert(map.hasLayer(ign));google.tilesloaded();assert.equal(root.dataset.mapProvider,'google');
 assert.equal(google.camera.heading,180);assert.equal(google.camera.zoom,17);
 root.dataset.mapType='aerial';observer();assert.equal(google.type,'hybrid');
 nav.onLine=false;events.offline();assert.equal(root.dataset.mapProvider,'ign');assert.equal(google.host.style.visibility,'hidden');
 nav.onLine=true;events.online();assert.equal(root.dataset.mapProvider,'google');
 googleAuthFailure();assert.equal(root.dataset.mapProvider,'ign');assert.match(status.textContent,/clave o la facturación/);
 root.dataset.mapType='street';select.value='mapbox';events['select:change']();
 assert.equal(root.dataset.mapProvider,'mapbox');assert.equal(google.host.style.visibility,'hidden');
 controller.destroy();assert.equal(removed,1);assert(map.hasLayer(ign));assert.equal(timers.size,0);
 console.log('Correcto: Mapbox opcional, carga diferida, cámara y giro alineados, cambio de estilos, estilo oscuro oficial y retorno a IGN sin conexión.');
})();

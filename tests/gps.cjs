const assert=require('assert'),{gpsDistance,gpsRouteDistance,gpsNearestStop,gpsBearing,gpsMotionCourse,createRouteNavigator}=require('../src/navigation.js');
assert(Math.abs(gpsDistance([0,0],[0,.001])-111.195)<1);
assert(gpsRouteDistance([.0005,0],[[[0,0],[.001,0]]])<.01);
assert(gpsRouteDistance([.0015,0],[[[0,0],[.001,0]],[[.002,0],[.003,0]]])>50,'Must not connect separate segments');
const stops=[{geometry:{x:0,y:0},attributes:{Nombre:'Origen'}},{geometry:{x:.001,y:0},attributes:{Nombre:'Destino'}}];assert.equal(gpsNearestStop([.0009,0],stops).index,1);assert.equal(gpsNearestStop([0,0],[]),null);

assert(Math.abs(gpsBearing([0,0],[.001,0])-90)<.01);assert(Math.abs(gpsBearing([0,0],[0,.001]))<.01);assert(Math.abs(gpsBearing([0,0],[0,-.001])-180)<.01);
const fix=(lon,lat=0,extra={})=>({lon,lat,accuracy:3,time:1000,speed:null,heading:null,...extra});
let anchor=fix(0),motion=gpsMotionCourse(anchor,fix(.00001,0,{time:2000}));assert.equal(motion.heading,null,'Ignore small GPS jitter');assert.equal(motion.anchor,anchor);
motion=gpsMotionCourse(anchor,fix(.0001,0,{time:3000}));assert(Math.abs(motion.heading-90)<.01,'Infer an eastward course from movement');
assert.equal(gpsMotionCourse(anchor,fix(.001,0,{time:2000,speed:0,heading:180})).heading,null,'Do not rotate while stationary');
assert.equal(gpsMotionCourse(anchor,fix(.001,0,{time:2000,speed:5,heading:90,accuracy:150})).heading,null,'Do not trust a poor fix');
assert.equal(gpsMotionCourse(anchor,fix(0,0,{time:2000,speed:5,heading:359})).heading,359);assert.equal(gpsMotionCourse(anchor,fix(0,0,{time:2000,speed:5,heading:0})).heading,0);
assert.equal(gpsMotionCourse(anchor,fix(.001,0,{time:40000})).heading,null,'Do not infer direction across a GPS outage');


const elements=Object.fromEntries(['expandMap','startGps','centerGps','gpsDetail','gpsPanel','gpsStatus','gpsMetrics','gpsStop'].map(id=>[id,{textContent:'',hidden:id==='expandMap',disabled:false,dataset:{},events:{},addEventListener(e,fn){this.events[e]=fn;},setAttribute(k,v){this[k]=v;},focus(){}}]));
const listeners={},windowListeners={},mapEvents={},classes=new Set();let scrollTop=null;
global.document={documentElement:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}},getElementById:id=>elements[id],visibilityState:'visible',addEventListener:(e,fn)=>listeners[e]=fn};
global.window={isSecureContext:true,addEventListener:(e,fn)=>windowListeners[e]=fn,scrollTo:options=>{scrollTop=options.top;}};
let success,error,approxSuccess,approxError,watchCalls=0,approxCalls=0,cleared=[];
Object.defineProperty(global,'navigator',{value:{geolocation:{watchPosition(s,e,options){success=s;error=e;watchCalls++;assert.equal(options.timeout,45000);assert.equal(options.enableHighAccuracy,true);return watchCalls;},getCurrentPosition(s,e,options){approxSuccess=s;approxError=e;approxCalls++;assert.equal(options.enableHighAccuracy,false);},clearWatch:id=>cleared.push(id)}},configurable:true});
const timeouts=new Map();let timeoutId=0,interval,intervalCleared=false,now=1000000;
const originals={setTimeout,clearTimeout,setInterval,clearInterval,now:Date.now};
global.setTimeout=(fn,ms)=>{assert.equal(ms,5000);timeouts.set(++timeoutId,fn);return timeoutId;};global.clearTimeout=id=>timeouts.delete(id);global.setInterval=fn=>{interval=fn;return 1;};global.clearInterval=()=>{intervalCleared=true;};Date.now=()=>now;
function expireControls(){const callbacks=[...timeouts.values()];timeouts.clear();callbacks.forEach(fn=>fn());}
const map={zoom:12,heading:null,pans:0,on(e,fn){mapEvents[e]=fn;},invalidateSize(){},getZoom(){return this.zoom;},setView(ll,z){this.ll=ll;this.zoom=z;},panTo(ll){this.ll=ll;this.pans++;},setHeading(h){this.heading=h;},stopHeadingUp(){this.heading=null;},setBearing(b){this.bearing=b;},removeLayer(){}};
function layer(){return {bindTooltip(){return this;},addTo(){return this;},setLatLng(){return this;},setStyle(){return this;},setRadius(){return this;}};}global.L={circleMarker:layer,circle:layer};
let route={geometry:{paths:[[[0,0],[.001,0]]]},stops};const nav=createRouteNavigator(map,()=>route);
function position(lon=0,extra={}){now+=1000;success({coords:{latitude:0,longitude:lon,accuracy:4,speed:8,heading:90,...extra},timestamp:now});}
try{
 nav.routeChanged();assert.equal(elements.startGps.disabled,false);assert.equal(elements.expandMap.hidden,true,'No expand button on the home screen');
 elements.startGps.onclick();elements.startGps.onclick();assert.equal(watchCalls,1);assert.equal(elements.expandMap.hidden,false);assert.equal(elements.centerGps.hidden,false);assert.equal(elements.centerGps.disabled,true);assert(classes.has('map-expanded'));
 error({code:3});assert.match(elements.gpsStatus.textContent,/ubicación precisa/);assert.equal(approxCalls,1);
 approxSuccess({coords:{latitude:0,longitude:0,accuracy:500},timestamp:now});assert.match(elements.gpsStatus.textContent,/poco precisa/);
 position();assert.equal(elements.gpsStatus.textContent,'');assert.equal(map.zoom,16);assert.equal(map.heading,90);assert.match(elements.gpsStop.textContent,/Origen/);assert.equal(elements.centerGps.disabled,false);
 position(.0001);assert(map.pans>0,'Movement is smoothed');
 mapEvents.dragstart();assert.equal(elements.centerGps['aria-pressed'],'false');map.ll=[1,1];position(.0002,{heading:180});assert.deepEqual(map.ll,[1,1],'Dragging pauses map following but GPS keeps receiving positions');
 elements.centerGps.onclick();assert.deepEqual(map.ll,[0,.0002],'Location icon centers the latest position');assert.equal(map.heading,180);assert.equal(elements.centerGps['aria-pressed'],'true');assert.equal(elements.centerGps.textContent,'','Location remains an icon, without a replacement text');
 const resting=[...map.ll];position(.000201,{speed:0,heading:40});assert.deepEqual(map.ll,resting,'Stationary jitter does not move the map');assert.equal(map.heading,180);
 position(.1,{accuracy:200});assert.deepEqual(map.ll,resting,'Poor fixes do not jump away from a reliable position');assert.equal(elements.gpsPanel.dataset.state,'warning');position(.0003);assert.equal(elements.gpsStatus.textContent,'');
 const stable=elements.gpsStatus.textContent;error({code:3});assert.equal(elements.gpsStatus.textContent,stable,'A temporary timeout keeps a recent fix');
 now+=45000;interval();assert.match(elements.gpsStatus.textContent,/Sin una posición reciente/);position(.0004,{heading:270});assert.equal(elements.gpsStatus.textContent,'');assert.equal(map.heading,270);
 position(.01);assert.equal(elements.gpsStatus.textContent,'','No off-route or GPS-active banner');
 const beforeOld=[...map.ll];success({coords:{latitude:0,longitude:0,accuracy:1,speed:8,heading:0},timestamp:now-60000});assert.deepEqual(map.ll,beforeOld,'Stale fixes are ignored');
 expireControls();assert.equal(elements.gpsDetail.dataset.optionsHidden,'true');assert.equal(elements.centerGps.hidden,false,'Location icon remains available when the return button auto-hides');elements.gpsDetail.events.pointerdown();assert.equal(elements.gpsDetail.dataset.optionsHidden,'false');assert.equal(timeouts.size,1);
 const late=success,lateApprox=approxSuccess;elements.expandMap.onclick();assert.equal(nav.isActive(),false);assert.equal(cleared.length,1);assert(intervalCleared);assert.equal(scrollTop,0);assert(!classes.has('map-expanded'));assert.equal(elements.startGps.hidden,false);assert.equal(elements.expandMap.hidden,true);assert.equal(elements.centerGps.hidden,true);assert.equal(elements.gpsPanel.hidden,true);assert.equal(timeouts.size,0);assert.equal(map.bearing,0);
 late({coords:{latitude:0,longitude:0,accuracy:1},timestamp:now});lateApprox({coords:{latitude:0,longitude:0,accuracy:1},timestamp:now});assert.equal(elements.centerGps.hidden,true,'Late fixes do not restart navigation');
 elements.startGps.onclick();route={...route};nav.routeChanged();assert.equal(nav.isActive(),false);assert.equal(cleared.length,2);elements.expandMap.onclick();
 elements.startGps.onclick();error({code:1});assert.equal(nav.isActive(),false);assert.match(elements.gpsStatus.textContent,/denegado/);assert.equal(elements.centerGps.hidden,true);elements.expandMap.onclick();
 window.isSecureContext=false;elements.startGps.onclick();assert.match(elements.gpsStatus.textContent,/HTTPS/);assert.equal(watchCalls,3);
 console.log('Correcto: rumbo, recuperación GPS, icono de ubicación tras mover el mapa, suavizado, vuelta al inicio, permisos y limpieza de recursos.');
}finally{global.setTimeout=originals.setTimeout;global.clearTimeout=originals.clearTimeout;global.setInterval=originals.setInterval;global.clearInterval=originals.clearInterval;Date.now=originals.now;}

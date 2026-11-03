function gpsDistance(a,b){const r=Math.PI/180,h=Math.sin((b[1]-a[1])*r/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin((b[0]-a[0])*r/2)**2;return 12742000*Math.asin(Math.sqrt(Math.min(1,h)));}
function gpsRouteDistance(point,paths){let best=Infinity;const scale=Math.cos(point[1]*Math.PI/180),m=111195;
 for(const path of paths)for(let i=1;i<path.length;i++){const a=[(path[i-1][0]-point[0])*scale*m,(path[i-1][1]-point[1])*m],b=[(path[i][0]-point[0])*scale*m,(path[i][1]-point[1])*m],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/den)):0;best=Math.min(best,Math.hypot(a[0]+t*dx,a[1]+t*dy));}return best;}
function gpsNearestStop(point,stops){let nearest=null;for(let i=0;i<stops.length;i++){const s=stops[i],distance=gpsDistance(point,[s.geometry.x,s.geometry.y]);if(!nearest||distance<nearest.distance)nearest={stop:s,index:i,distance};}return nearest;}
function gpsBearing(a,b){const r=Math.PI/180,p=a[1]*r,q=b[1]*r,d=(b[0]-a[0])*r;return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))/r+360)%360;}
function gpsMotionCourse(anchor,fix){
 if(fix.accuracy>50)return {heading:null,anchor};
 if(Number.isFinite(fix.speed)&&fix.speed<.6)return {heading:null,anchor:fix};
 if(Number.isFinite(fix.heading)&&fix.heading>=0&&fix.heading<360&&Number.isFinite(fix.speed)&&fix.speed>=.6)return {heading:fix.heading,anchor:fix};
 if(!anchor||fix.time-anchor.time>30000||fix.time<=anchor.time)return {heading:null,anchor:fix};
 const a=[anchor.lon,anchor.lat],b=[fix.lon,fix.lat],threshold=Math.max(8,Math.hypot(anchor.accuracy,fix.accuracy));
 if(gpsDistance(a,b)<threshold)return {heading:null,anchor};
 return {heading:gpsBearing(a,b),anchor:fix};
}
// Position the vehicle 70% down the visible map, leaving more road ahead.
function gpsLookAheadCenter(map,position,bearing,zoom){
 if(!map.getSize||!map.project||!map.unproject)return [position.lat,position.lon];
 const height=map.getSize().y;if(!Number.isFinite(height)||height<=0)return [position.lat,position.lon];
 const point=map.project([position.lat,position.lon],zoom),distance=height*.2,angle=(bearing??0)*Math.PI/180;
 const center=map.unproject({x:point.x-Math.sin(angle)*distance,y:point.y-Math.cos(angle)*distance},zoom);
 return [center.lat,center.lng];
}
// One camera clock moves and turns the map without competing CSS pan animations.
function createGpsCamera(map,onFrame=()=>{}){
 let frame=null,point=null,bearing=null;
 const raf=typeof requestAnimationFrame==='function'?requestAnimationFrame:null;
 function cancel(){if(frame!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);frame=null;}
 function draw(p,b,snap=false){if(b!==null&&map.setBearing)map.setBearing(b);const zoom=!point?Math.max(16,map.getZoom()):map.getZoom(),center=gpsLookAheadCenter(map,p,b,zoom);if(snap||!map.panTo)map.setView(center,zoom,{animate:false,reset:snap});else map.panTo(center,{animate:false});point=p;bearing=b;onFrame(p);}
 function follow(fix,heading,reset=false){
  cancel();if(map.stopHeadingUp)map.stopHeadingUp();
  const target={lat:fix.lat,lon:fix.lon},targetBearing=heading===null?(bearing??(map.getBearing?map.getBearing():null)):(360-heading)%360;
  if(!point||reset||!raf||gpsDistance([point.lon,point.lat],[target.lon,target.lat])>400){draw(target,targetBearing,!point||reset);return;}
  const from={...point},fromBearing=map.getBearing?map.getBearing():bearing,turn=targetBearing===null||fromBearing===null?0:((targetBearing-fromBearing+540)%360)-180;
  let start=null,previous=-Infinity;
  function tick(time){frame=null;if(start===null)start=time;const progress=Math.min(1,(time-start)/650);
   if(time-previous>=1000/30||progress===1){previous=time;const ease=progress*progress*(3-2*progress);draw({lat:from.lat+(target.lat-from.lat)*ease,lon:from.lon+(target.lon-from.lon)*ease},targetBearing===null?null:(fromBearing+turn*ease+360)%360);}
   if(progress<1)frame=raf(tick);
  }
  frame=raf(tick);
 }
 return {follow,cancel,reset(){cancel();point=bearing=null;}};
}
// Reacquire a system-released screen lock without piling up requests or retrying rapidly.
function createScreenWakeLock(shouldHold,onChange=()=>{},environment={window,document,navigator}){
 const {window:win,document:doc,navigator:nav}=environment;
 let lock=null,pending=null,epoch=0,retryTimer=null,nextAttempt=0,lastAttempt=-Infinity,destroyed=false;
 const visible=()=>doc.visibilityState==='visible';
 const wanted=()=>!destroyed&&shouldHold()&&visible();
 const report=state=>onChange(state);
 function clearRetry(){if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}}
 function schedule(delay){if(!wanted()||retryTimer!==null)return;retryTimer=setTimeout(()=>{retryTimer=null;ensure();},delay);}
 async function ensure(fromGesture=false){
  if(!wanted())return;
  if(!nav.wakeLock?.request){report('unsupported');return;}
  if(lock&&!lock.released){report('active');return;}
  if(pending)return;
  const now=Date.now();
  if(now<nextAttempt&&(!fromGesture||now-lastAttempt<1000)){schedule(Math.max(1000,nextAttempt-now));return;}
  clearRetry();lastAttempt=now;const ticket={epoch};pending=ticket;report('requesting');
  try{
   const acquired=await nav.wakeLock.request('screen');
   if(!wanted()||ticket.epoch!==epoch){await acquired.release();return;}
   lock=acquired;nextAttempt=0;
   acquired.addEventListener('release',()=>{if(lock!==acquired)return;lock=null;if(wanted()){report('waiting');schedule(2000);}});
   if(acquired.released){lock=null;report('waiting');schedule(2000);}else report('active');
  }catch{if(ticket.epoch===epoch&&wanted()){nextAttempt=Date.now()+30000;report('waiting');schedule(30000);}}
  finally{if(pending===ticket)pending=null;if(ticket.epoch!==epoch&&wanted())Promise.resolve().then(()=>ensure());}
 }
 function pause(){epoch++;clearRetry();nextAttempt=0;const previous=lock;lock=null;if(previous)Promise.resolve(previous.release()).catch(()=>{});report(shouldHold()?'paused':'idle');}
 function visibility(){if(visible())ensure();else pause();}
 function gesture(){ensure(true);}
 function resume(){ensure();}
 doc.addEventListener('visibilitychange',visibility);doc.addEventListener('pointerup',gesture,{passive:true});doc.addEventListener('keydown',gesture);
 win.addEventListener('focus',resume);win.addEventListener('pageshow',resume);
 return {ensure,pause,destroy(){destroyed=true;pause();doc.removeEventListener('visibilitychange',visibility);doc.removeEventListener('pointerup',gesture);doc.removeEventListener('keydown',gesture);win.removeEventListener('focus',resume);win.removeEventListener('pageshow',resume);}};
}

async function runGpsDiagnostic(env={window,navigator,setTimeout,clearTimeout,now:()=>Date.now()}){
 const nav=env.navigator,result={secure:!!env.window.isSecureContext,available:!!nav.geolocation,permission:'desconocido',tests:[]};
 if(!result.secure||!result.available)return result;
 async function bounded(start,wait,fallback){return new Promise(resolve=>{let finished=false;const timer=env.setTimeout(()=>finish(fallback),wait);function finish(value){if(finished)return;finished=true;env.clearTimeout(timer);resolve(value);}try{start(finish);}catch(error){finish({status:'exception',message:String(error?.message||error).slice(0,180)});}});}
 if(nav.permissions?.query){const permission=await bounded(done=>nav.permissions.query({name:'geolocation'}).then(p=>done({state:p.state}),()=>done({})),1500,{});result.permission=permission.state||'desconocido';}
 for(const high of [false,true]){
  const test=await bounded(done=>nav.geolocation.getCurrentPosition(position=>{const c=position?.coords;const valid=c&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180&&Number.isFinite(c.accuracy)&&c.accuracy>=0;done({status:valid?'received':'invalid',accuracy:valid?Math.round(c.accuracy):null,age:Number.isFinite(position?.timestamp)?Math.round((env.now()-position.timestamp)/1000):null});},error=>done({status:'error',code:error.code,message:String(error.message||'').slice(0,180)}),{enableHighAccuracy:high,maximumAge:0,timeout:15000}),20000,{status:'no-callback'});
  result.tests.push({mode:high?'precisa':'aproximada',...test});if(test.code===1)break;
 }
 return result;
}
function gpsDiagnosticText(result){
 const lines=['Diagnóstico GPS · versión 2026-11-03.3','Conexión segura: '+(result.secure?'sí':'no'),'API de ubicación: '+(result.available?'disponible':'no disponible'),'Permiso web: '+({granted:'concedido',denied:'denegado',prompt:'pendiente'}[result.permission]||'no comprobable')];
 for(const test of result.tests){let text=test.status==='received'?'posición recibida; precisión '+test.accuracy+' m; antigüedad '+(test.age??'desconocida')+' s':test.status==='invalid'?'el navegador devolvió datos no válidos':test.status==='no-callback'?'el navegador no respondió en 20 s':test.status==='exception'?'excepción: '+test.message:({1:'permiso denegado',2:'posición no disponible',3:'tiempo agotado'}[test.code]||'error')+' (código '+test.code+')'+(test.message?' · '+test.message:'');lines.push('Solicitud '+test.mode+': '+text);}
 return lines.join('\n');
}

function createRouteNavigator(map,getRoute,onStateChange=()=>{}){
 const el=id=>document.getElementById(id);let active=false,watch=null,generation=0,marker=null,accuracyCircle=null,last=null,following=true,timer=null,routeKey=null;
 let approximatePending=false,approximateAttempt=0,approximateSerial=0,watchSerial=0,watchStarted=0;
 let expanded=false,returnFocus=null,resumeNavigation=false;
 let travelHeading=null,courseAnchor=null;
 let viewPosition=null,zooming=false;
 const camera=createGpsCamera(map,p=>{if(marker)marker.setLatLng([p.lat,p.lon]);if(accuracyCircle)accuracyCircle.setLatLng([p.lat,p.lon]);orientArrow();});
 function followPosition(){if(!last||!following||zooming)return;camera.follow(last,travelHeading,viewPosition===null);viewPosition=[last.lon,last.lat];}
 function orientArrow(){const shape=marker?.getElement?.()?.querySelector('.gps-arrow-shape');if(shape)shape.style.transform='rotate('+((following&&map.getBearing?-map.getBearing():(travelHeading??0))+(map.getBearing?map.getBearing():0))+'deg)';}
 let chromeTimer=null;
 function clearChromeTimer(){if(chromeTimer!==null){clearTimeout(chromeTimer);chromeTimer=null;}}
 function revealOptions(){
  clearChromeTimer();el('gpsDetail').dataset.optionsHidden='false';
  if(expanded&&active&&el('gpsDetail').dataset.menuOpen!=='true')chromeTimer=setTimeout(()=>{chromeTimer=null;if(expanded&&active){el('gpsDetail').dataset.optionsHidden='true';if(map.closePopup)map.closePopup();if(map.eachLayer)map.eachLayer(layer=>{if(layer.closeTooltip)layer.closeTooltip();});}},5000);
 }
 el('gpsDetail').addEventListener('pointerdown',revealOptions,{passive:true,capture:true});
 el('gpsDetail').addEventListener('pointerup',revealOptions,{passive:true,capture:true});
 el('gpsDetail').addEventListener('keydown',revealOptions);
 el('gpsDetail').addEventListener('focusin',revealOptions);
 function expand(){
  if(!map)return;
  const detail=el('gpsDetail');
  if(!expanded){returnFocus=document.activeElement;expanded=true;detail.dataset.expanded='true';document.documentElement.classList.add('map-expanded');}
  revealOptions();map.invalidateSize();
 }
 function collapse(){
  if(!expanded)return;expanded=false;clearChromeTimer();el('gpsDetail').dataset.optionsHidden='false';el('gpsDetail').dataset.expanded='false';document.documentElement.classList.remove('map-expanded');if(active)stop('');
  map.invalidateSize();if(returnFocus&&returnFocus.focus)returnFocus.focus({preventScroll:true});window.scrollTo?.({top:0,left:0,behavior:'auto'});
 }
 if(typeof L!=='undefined'&&L.DomEvent){L.DomEvent.disableClickPropagation(el('centerGps'));L.DomEvent.disableScrollPropagation(el('centerGps'));}
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded&&el('gpsDetail').dataset.menuOpen!=='true'){event.preventDefault();collapse();}});
 function status(text,state='normal'){el('gpsStatus').textContent=text;el('gpsPanel').dataset.state=state;el('gpsPanel').hidden=!text;}
 function controls(){if(el('startGps'))el('startGps').hidden=active;el('centerGps').hidden=!active||!expanded||following||!last;el('centerGps').disabled=!last;el('centerGps').setAttribute('aria-pressed',String(following));el('gpsDetail').dataset.navigating=String(active);onStateChange(active);}
 const awake=createScreenWakeLock(()=>active,state=>{const text=el('wakeStatus'),retry=el('retryWake');if(text)text.textContent={active:'Activa durante la navegación.',requesting:'Solicitando al sistema…',waiting:'El sistema no la ha concedido. Se volverá a intentar.',unsupported:'Este navegador no permite mantener la pantalla encendida.',paused:'En pausa mientras la app no está visible.',idle:'Se activa al iniciar el GPS.'}[state];if(retry)retry.hidden=state!=='waiting';});
 if(el('retryWake'))el('retryWake').onclick=()=>awake.ensure(true);
 const keepAwake=()=>awake.ensure(),releaseWake=()=>awake.pause();
 function stop(message='GPS detenido.'){resumeNavigation=false;camera.reset();active=false;revealOptions();generation++;watchSerial++;approximateSerial++;approximatePending=false;if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}if(timer!==null){clearInterval(timer);timer=null;}releaseWake();last=null;travelHeading=courseAnchor=viewPosition=null;if(map){if(map.stopHeadingUp)map.stopHeadingUp();if(map.setBearing)map.setBearing(0);if(marker)map.removeLayer(marker);if(accuracyCircle)map.removeLayer(accuracyCircle);}marker=accuracyCircle=null;controls();status(message);if(!message)el('gpsPanel').hidden=true;}
 function requestApproximate(token){if(!active||token!==generation||(approximatePending&&Date.now()-approximateAttempt<20000)||!navigator.geolocation.getCurrentPosition)return;approximatePending=true;approximateAttempt=Date.now();const serial=++approximateSerial;
  try{navigator.geolocation.getCurrentPosition(data=>{if(!active||token!==generation||serial!==approximateSerial)return;approximatePending=false;if(last&&Date.now()-last.time<15000&&data.coords.accuracy>last.accuracy)return;position(data,token);},error=>{if(!active||token!==generation||serial!==approximateSerial)return;approximatePending=false;if(error.code===1){stop('Acceso a la ubicación denegado. Permite la ubicación del navegador y del sitio web en los ajustes del móvil.');el('gpsPanel').dataset.state='warning';}},{enableHighAccuracy:false,maximumAge:0,timeout:15000});}catch{approximatePending=false;}
 }
 function position(data,token){if(!active||token!==generation)return;const c=data.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy<0||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180)return;
  if(last&&data.timestamp<=last.time)return;
  if(!Number.isFinite(data.timestamp)||Date.now()-data.timestamp>30000){status('La posición recibida es antigua. Esperando una señal GPS reciente…','warning');return;}
  if(last&&last.accuracy<=50&&c.accuracy>100){status('Señal GPS poco precisa. Conservando la última posición fiable…','warning');return;}
  const next={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,time:data.timestamp,speed:c.speed,heading:c.heading};
  if(last&&data.timestamp-last.time<10000&&Number.isFinite(c.speed)&&c.speed<.6&&gpsDistance([last.lon,last.lat],[next.lon,next.lat])<Math.max(4,Math.min(10,c.accuracy*.6))){next.lat=last.lat;next.lon=last.lon;}
  if(last&&data.timestamp-last.time<10000&&gpsDistance([last.lon,last.lat],[next.lon,next.lat])>Math.max(80,(data.timestamp-last.time)/1000*45+last.accuracy+next.accuracy))return;
  last=next;const ll=[last.lat,last.lon];
  const motion=gpsMotionCourse(courseAnchor,last);courseAnchor=motion.anchor;if(motion.heading!==null)travelHeading=motion.heading;
  if(!marker){marker=L.marker(ll,{icon:L.divIcon({className:'gps-arrow',iconSize:[36,36],iconAnchor:[18,18],html:'<svg class="gps-arrow-shape" viewBox="0 0 36 36" aria-hidden="true"><path d="M18 3 L32 32 L18 26 L4 32 Z" fill="#e2231a" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>'}),keyboard:false,interactive:false,zIndexOffset:1000}).bindTooltip('Tu posición GPS').addTo(map);accuracyCircle=L.circle(ll,{radius:last.accuracy,color:'#e2231a',weight:1,fillColor:'#e2231a',fillOpacity:.08,interactive:false}).addTo(map);}else{if(!following){marker.setLatLng(ll);accuracyCircle.setLatLng(ll);}marker.setOpacity(1);accuracyCircle.setRadius(last.accuracy);}
  followPosition();orientArrow();
  const poor=last.accuracy>80;
  status(poor?'Señal GPS poco precisa. Espera una mejor señal.':'',poor?'warning':'normal');
  controls();
 }
 function armWatch(token){const serial=++watchSerial;if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}watchStarted=Date.now();watch=navigator.geolocation.watchPosition(data=>{if(serial===watchSerial)position(data,token);},error=>{if(!active||token!==generation||serial!==watchSerial)return;if(error.code===1){stop('Acceso a la ubicación denegado. Puedes permitirlo desde los ajustes del sitio en tu navegador.');el('gpsPanel').dataset.state='warning';}else{if(last&&Date.now()-last.time<=30000)return;status(error.code===3?'Todavía no hay una posición reciente. Activa la ubicación precisa del navegador, prueba al aire libre y mantén esta pantalla abierta.':'El móvil no está proporcionando ubicación. Revisa su localización y el permiso del navegador; seguimos intentando.','warning');if(Date.now()-approximateAttempt>20000)requestApproximate(token);}},{enableHighAccuracy:true,maximumAge:0,timeout:45000});}
 function recoverGps(){if(!active||document.visibilityState==='hidden')return;if((!last||Date.now()-last.time>30000)&&Date.now()-watchStarted>=60000){try{armWatch(generation);}catch{status('No se ha podido reactivar el GPS. Pulsa Reintentar ubicación.','warning');}}}
 if(el('gpsDiagnosticButton'))el('gpsDiagnosticButton').onclick=async()=>{const button=el('gpsDiagnosticButton'),output=el('gpsDiagnosticOutput');button.disabled=true;output.textContent='Consultando el GPS del navegador… Puede tardar hasta 40 segundos.';try{output.textContent=gpsDiagnosticText(await runGpsDiagnostic());}catch{output.textContent='No se ha podido completar la prueba del GPS.';}finally{button.disabled=false;}};
 if(el('retryGps'))el('retryGps').onclick=()=>{stop('');start();};
 function start(){if(active)return;if(!map){status('No se ha podido cargar el mapa. Recarga la página para usar el GPS.','warning');return;}if(!window.isSecureContext||!navigator.geolocation){status('Abre la web publicada con HTTPS en el navegador del móvil para usar su ubicación.','warning');return;}
  active=true;following=true;approximatePending=false;approximateAttempt=0;routeKey=getRoute();const token=++generation;expand();controls();status('Buscando tu ubicación… Permite el acceso si el navegador lo solicita. La primera posición puede tardar hasta un minuto.');
  try{armWatch(token);
   requestApproximate(token);
   timer=setInterval(()=>{if(!active)return;recoverGps();if(last&&Date.now()-last.time>30000){status('Sin una posición reciente. La última ubicación puede estar desactualizada.','warning');if(marker)marker.setOpacity(.4);}if((!last||Date.now()-last.time>30000)&&Date.now()-approximateAttempt>20000)requestApproximate(token);},5000);keepAwake();
  }catch{stop('No se ha podido iniciar el GPS. Abre la web en el navegador del móvil y revisa el permiso de ubicación.');el('gpsPanel').dataset.state='warning';}
 }
 if(el('startGps'))el('startGps').onclick=start;el('centerGps').onclick=()=>{if(!last)return;camera.cancel();try{if(map.stop)map.stop();zooming=false;following=true;viewPosition=null;followPosition();if(Date.now()-last.time<30000&&last.accuracy<=80)status('');}catch{following=false;status('No se ha podido volver a tu ubicación. Pulsa de nuevo el botón.','warning');}controls();};
 if(map)map.on('rotate',orientArrow);
 if(map)map.on('resize',()=>{if(active&&following)followPosition();});
 if(map)map.on('zoomstart',()=>{zooming=true;camera.cancel();});
 if(map)map.on('zoomend',()=>{zooming=false;if(active&&following)followPosition();});
 if(map)map.on('dragstart',()=>{if(active){camera.cancel();following=false;if(map.stopHeadingUp)map.stopHeadingUp();controls();}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(active){recoverGps();if(!last||Date.now()-last.time>30000){status('Retomando el GPS. Esperando una posición reciente…','warning');requestApproximate(generation);}keepAwake();}}else{releaseWake();}});
 window.addEventListener('pagehide',()=>{const wasActive=active;if(active)stop('');resumeNavigation=wasActive;});
 window.addEventListener('pageshow',()=>{if(resumeNavigation){resumeNavigation=false;start();}else if(active)keepAwake();});
 return {start,isActive:()=>active,exit:collapse,revealControls:revealOptions,routeChanged(){const route=getRoute();if(active&&route!==routeKey)stop('Has cambiado de recorrido.');if(el('startGps'))el('startGps').disabled=!route;},stop};
}
if(typeof module!=='undefined')module.exports={gpsDistance,gpsRouteDistance,gpsNearestStop,gpsBearing,gpsMotionCourse,gpsLookAheadCenter,createGpsCamera,createScreenWakeLock,createRouteNavigator,runGpsDiagnostic,gpsDiagnosticText};

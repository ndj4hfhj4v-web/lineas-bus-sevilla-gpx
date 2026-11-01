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
function createRouteNavigator(map,getRoute,onStateChange=()=>{}){
 const el=id=>document.getElementById(id);let active=false,watch=null,generation=0,marker=null,accuracyCircle=null,last=null,following=true,timer=null,wake=null,routeKey=null;
 let approximatePending=false,approximateAttempt=0;
 let expanded=false,returnFocus=null;
 let travelHeading=null,courseAnchor=null;
 let compassEnabled=false,compassHeading=null,compassTime=0,viewPosition=null;
 function followPosition(){if(!last||!following)return;if(travelHeading!==null&&map.setHeading)map.setHeading(travelHeading,{ease:.18,deadzone:1});const ll=[last.lat,last.lon];if(viewPosition&&map.panTo&&map.getZoom()>=16&&gpsDistance(viewPosition,[last.lon,last.lat])<400)map.panTo(ll,{animate:true,duration:.6,easeLinearity:.3});else map.setView(ll,Math.max(16,map.getZoom()),{animate:false});viewPosition=[last.lon,last.lat];}
 function onCompass(event){const heading=Number.isFinite(event.webkitCompassHeading)?event.webkitCompassHeading:event.absolute&&Number.isFinite(event.alpha)?(360-event.alpha)%360:null;if(heading===null||Number.isFinite(event.webkitCompassAccuracy)&&(event.webkitCompassAccuracy<0||event.webkitCompassAccuracy>25))return;compassHeading=heading;compassTime=Date.now();}
 function stopCompass(){window.removeEventListener?.('deviceorientation',onCompass);compassEnabled=false;compassHeading=null;}
 let chromeTimer=null;
 function clearChromeTimer(){if(chromeTimer!==null){clearTimeout(chromeTimer);chromeTimer=null;}}
 function revealOptions(){
  clearChromeTimer();el('gpsDetail').dataset.optionsHidden='false';
  if(expanded&&active)chromeTimer=setTimeout(()=>{chromeTimer=null;if(expanded&&active){el('gpsDetail').dataset.optionsHidden='true';if(map.closePopup)map.closePopup();if(map.closeTooltip)map.closeTooltip();}},5000);
 }
 el('gpsDetail').addEventListener('pointerdown',revealOptions,{passive:true,capture:true});
 el('gpsDetail').addEventListener('pointerup',revealOptions,{passive:true,capture:true});
 el('gpsDetail').addEventListener('keydown',revealOptions);
 el('gpsDetail').addEventListener('focusin',revealOptions);
 function expand(){
  if(!map||!getRoute())return;
  const detail=el('gpsDetail');
  if(!expanded){returnFocus=document.activeElement;expanded=true;detail.dataset.expanded='true';document.documentElement.classList.add('map-expanded');el('expandMap').textContent='Volver a las líneas';el('expandMap').setAttribute('aria-expanded','true');el('expandMap').focus();}
  revealOptions();map.invalidateSize();
 }
 function collapse(){
  if(!expanded)return;expanded=false;clearChromeTimer();el('gpsDetail').dataset.optionsHidden='false';el('gpsDetail').dataset.expanded='false';document.documentElement.classList.remove('map-expanded');el('expandMap').textContent='Ampliar mapa';el('expandMap').setAttribute('aria-expanded','false');
  map.invalidateSize();if(returnFocus&&returnFocus.focus)returnFocus.focus();
 }
 el('expandMap').onclick=()=>expanded?collapse():expand();
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded){event.preventDefault();collapse();}});
 const meters=n=>n>=1000?(n/1000).toLocaleString('es',{maximumFractionDigits:1})+' km':Math.round(n)+' m';
 function status(text,state='normal'){el('gpsStatus').textContent=text;el('gpsPanel').dataset.state=state;el('gpsPanel').hidden=false;}
 function controls(){el('startGps').hidden=active;el('stopGps').hidden=!active;el('centerGps').hidden=!active;el('centerGps').disabled=!last;el('centerGps').setAttribute('aria-pressed',String(following));el('centerGps').textContent=following?'Siguiendo tu ubicación':'Centrar en mí';el('toggleFollow').hidden=!active;el('toggleFollow').textContent=following?'Pausar seguimiento':'Reactivar seguimiento';el('toggleFollow').setAttribute('aria-pressed',String(following));el('compassGps').hidden=!active||typeof DeviceOrientationEvent==='undefined';el('compassGps').setAttribute('aria-pressed',String(compassEnabled));el('gpsDetail').dataset.navigating=String(active);onStateChange(active);if(map)map.invalidateSize();}
 async function keepAwake(){if(!active||document.visibilityState!=='visible'||!navigator.wakeLock||wake)return;const token=generation;try{const lock=await navigator.wakeLock.request('screen');if(!active||token!==generation){await lock.release();return;}wake=lock;lock.addEventListener('release',()=>{if(wake===lock)wake=null;});}catch{/* Screen wake lock is optional; GPS remains usable. */}}
 function releaseWake(){const old=wake;wake=null;if(old)old.release().catch(()=>{});}
 function stop(message='GPS detenido.'){active=false;revealOptions();generation++;if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}if(timer!==null){clearInterval(timer);timer=null;}releaseWake();stopCompass();last=null;travelHeading=courseAnchor=viewPosition=null;if(map){if(map.stopHeadingUp)map.stopHeadingUp();if(map.setBearing)map.setBearing(0);if(marker)map.removeLayer(marker);if(accuracyCircle)map.removeLayer(accuracyCircle);}marker=accuracyCircle=null;el('gpsMetrics').textContent='';el('gpsStop').textContent='';controls();status(message);}
 function requestApproximate(token){if(!active||token!==generation||approximatePending||!navigator.geolocation.getCurrentPosition)return;approximatePending=true;approximateAttempt=Date.now();
  try{navigator.geolocation.getCurrentPosition(data=>{if(!active||token!==generation)return;approximatePending=false;if(last&&Date.now()-last.time<15000&&data.coords.accuracy>last.accuracy)return;position(data,token);},error=>{if(!active||token!==generation)return;approximatePending=false;if(error.code===1){stop('Acceso a la ubicación denegado. Permite la ubicación del navegador y del sitio web en los ajustes del móvil.');el('gpsPanel').dataset.state='warning';}},{enableHighAccuracy:false,maximumAge:0,timeout:15000});}catch{approximatePending=false;}
 }
 function position(data,token){if(!active||token!==generation)return;const c=data.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy<0||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180)return;
  if(last&&data.timestamp<last.time)return;
  if(!Number.isFinite(data.timestamp)||Date.now()-data.timestamp>30000){status('La posición recibida es antigua. Esperando una señal GPS reciente…','warning');return;}
  const route=getRoute();if(!route)return;if(last&&last.accuracy<=50&&c.accuracy>100){status('Señal GPS poco precisa. Conservando la última posición fiable…','warning');return;}
  const next={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,time:data.timestamp,speed:c.speed,heading:c.heading};
  if(last&&data.timestamp-last.time<10000&&Number.isFinite(c.speed)&&c.speed<.6&&gpsDistance([last.lon,last.lat],[next.lon,next.lat])<Math.max(4,Math.min(10,c.accuracy*.6))){next.lat=last.lat;next.lon=last.lon;}
  last=next;const ll=[last.lat,last.lon];
  const motion=gpsMotionCourse(courseAnchor,last);courseAnchor=motion.anchor;if(motion.heading!==null)travelHeading=motion.heading;
  else if(travelHeading===null&&compassEnabled&&Date.now()-compassTime<3000&&c.speed>=.6&&c.accuracy<=50)travelHeading=compassHeading;
  if(!marker){marker=L.circleMarker(ll,{radius:8,color:'#ffffff',weight:3,fillColor:'#147bd1',fillOpacity:1}).bindTooltip('Tu posición GPS').addTo(map);accuracyCircle=L.circle(ll,{radius:last.accuracy,color:'#147bd1',weight:1,fillColor:'#147bd1',fillOpacity:.08,interactive:false}).addTo(map);}else{marker.setLatLng(ll);marker.setStyle({opacity:1,fillOpacity:1});accuracyCircle.setLatLng(ll);accuracyCircle.setRadius(last.accuracy);}
  followPosition();
  const offset=gpsRouteDistance([last.lon,last.lat],route.geometry.paths),poor=last.accuracy>80;
  status(poor?'Señal GPS poco precisa. Espera una mejor señal.':'',poor?'warning':'normal');
  el('gpsMetrics').textContent='Precisión aproximada: ±'+meters(last.accuracy)+' · Distancia al trazado: '+meters(offset);
  const nearest=gpsNearestStop([last.lon,last.lat],route.stops||[]);el('gpsStop').textContent=nearest?'Parada más cercana: '+(nearest.index+1)+'. '+nearest.stop.attributes.Nombre+' · '+meters(nearest.distance)+' en línea recta':'';controls();
 }
 function start(){if(active)return;if(!getRoute()){status('Selecciona primero una línea y el sentido.','warning');return;}if(!map){status('No se ha podido cargar el mapa. Recarga la página para usar el GPS.','warning');return;}if(!window.isSecureContext||!navigator.geolocation){status('Abre la web publicada con HTTPS en el navegador del móvil para usar su ubicación.','warning');return;}
  active=true;following=true;approximatePending=false;approximateAttempt=0;routeKey=getRoute();const token=++generation;expand();controls();status('Buscando tu ubicación… Permite el acceso si el navegador lo solicita. La primera posición puede tardar hasta un minuto.');
  try{watch=navigator.geolocation.watchPosition(data=>position(data,token),error=>{if(!active||token!==generation)return;if(error.code===1){stop('Acceso a la ubicación denegado. Puedes permitirlo desde los ajustes del sitio en tu navegador.');el('gpsPanel').dataset.state='warning';}else{if(last&&Date.now()-last.time<=30000)return;status(error.code===3?'Todavía no hay una posición reciente. Activa la ubicación precisa del navegador, prueba al aire libre y mantén esta pantalla abierta.':'El móvil no está proporcionando ubicación. Revisa su localización y el permiso del navegador; seguimos intentando.','warning');if(Date.now()-approximateAttempt>20000)requestApproximate(token);}},{enableHighAccuracy:true,maximumAge:0,timeout:45000});
   requestApproximate(token);
   timer=setInterval(()=>{if(!active)return;if(last&&Date.now()-last.time>30000){status('Sin una posición reciente. La última ubicación puede estar desactualizada.','warning');if(marker)marker.setStyle({opacity:.4,fillOpacity:.4});}if((!last||Date.now()-last.time>30000)&&Date.now()-approximateAttempt>20000)requestApproximate(token);},5000);keepAwake();
  }catch{stop('No se ha podido iniciar el GPS. Abre la web en el navegador del móvil y revisa el permiso de ubicación.');el('gpsPanel').dataset.state='warning';}
 }
 el('startGps').onclick=start;el('stopGps').onclick=()=>stop();el('centerGps').onclick=()=>{following=true;followPosition();controls();};
 el('toggleFollow').onclick=()=>{following=!following;if(following)followPosition();else if(map.stopHeadingUp)map.stopHeadingUp();controls();revealOptions();};
 el('compassGps').onclick=async()=>{if(compassEnabled){stopCompass();controls();return;}const token=generation;try{if(typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted')throw Error();if(!active||token!==generation)return;compassEnabled=true;window.addEventListener('deviceorientation',onCompass);controls();}catch{status('Brújula no disponible o sin permiso. El seguimiento con rumbo GPS continúa.','warning');}};
 if(map)map.on('dragstart',()=>{if(active){following=false;if(map.stopHeadingUp)map.stopHeadingUp();controls();}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(active){if(!last||Date.now()-last.time>30000){status('Retomando el GPS. Esperando una posición reciente…','warning');requestApproximate(generation);}keepAwake();}}else{releaseWake();}});
 window.addEventListener('pagehide',()=>{if(active)stop();});
 return {isActive:()=>active,routeChanged(){const route=getRoute();if(active&&route!==routeKey)stop('Has cambiado de recorrido. Pulsa «Abrir recorrido con GPS» para seguir el nuevo sentido.');el('startGps').disabled=!route;el('expandMap').disabled=!route;},stop};
}
if(typeof module!=='undefined')module.exports={gpsDistance,gpsRouteDistance,gpsNearestStop,gpsBearing,gpsMotionCourse,createRouteNavigator};

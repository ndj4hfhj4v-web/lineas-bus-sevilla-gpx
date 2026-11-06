const $=id=>document.getElementById(id);let features=[],groups=[],selected='',current=null,routeLayer=null,stopMarkers=[],stopMarkerRadius=null,terminalStopRenderer=null,background=null,routeArrowsController=null,automaticNetwork=null,latestOfflineDataset=null,savedOnly=false,savedLines=new Map();
const MAP_BACKGROUNDS={street:{service:'ign-base',layer:'IGNBaseTodo'},aerial:{service:'pnoa-ma',layer:'OI.OrthoimageCoverage'},topographic:{service:'mapa-raster',layer:'MTN'}};
function validMapType(value){return ['street','aerial','topographic'].includes(value)?value:'street';}
function readMapType(){try{return validMapType(localStorage.getItem('bus-sevilla-map-type'));}catch{return 'street';}}
function mapTileUrl(type){const source=MAP_BACKGROUNDS[validMapType(type)];return 'https://www.ign.es/wmts/'+source.service+'?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER='+source.layer+'&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';}

// Optional Mapbox renderer. IGN remains the only source used by offline map packs.
const PERSONAL_MAP_KEYS = 'copiloter-personal-map-keys';

function readPersonalMapKeys(storage) {
 try { return JSON.parse(storage().getItem(PERSONAL_MAP_KEYS)) || {}; }
 catch { return {}; }
}

function initPersonalMapKeys() {
 const form = $('personalMapKeys');
 const mapbox = $('personalMapboxToken');
 const google = $('personalGoogleKey');
 const status = $('personalMapKeysStatus');
 const saved = readPersonalMapKeys(() => localStorage);
 mapbox.value = saved.mapbox || '';
 google.value = saved.google || '';
 form.onsubmit = event => {
  event.preventDefault();
  const keys = {mapbox:mapbox.value.trim(),google:google.value.trim()};
  if (keys.mapbox && !/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(keys.mapbox)) {
   status.textContent = 'Introduce un token público de Mapbox que empiece por pk.';
   return;
  }
  if (keys.google && !/^[A-Za-z0-9_-]+$/.test(keys.google)) {
   status.textContent = 'Revisa la clave de navegador de Google Maps.';
   return;
  }
  try { localStorage.setItem(PERSONAL_MAP_KEYS, JSON.stringify(keys)); }
  catch { status.textContent = 'El navegador no permite guardar las claves en este dispositivo.'; return; }
  location.reload();
 };
}
function mapboxCamera(map){const center=map.getCenter();return {center:[center.lng,center.lat],zoom:map.getZoom()-1,bearing:-(map.getBearing?map.getBearing():0),pitch:0};}
function mapboxStyle(type,dark=false){return 'mapbox://styles/mapbox/'+(type==='street'&&dark?'dark-v11':({street:'streets-v12',aerial:'satellite-streets-v12',topographic:'outdoors-v12'}[type]||'streets-v12'));}
let mapboxSdkPromise;
function loadMapboxSdk(doc=document,win=window){
 if(win.mapboxgl)return Promise.resolve(win.mapboxgl);if(mapboxSdkPromise)return mapboxSdkPromise;
 mapboxSdkPromise=new Promise((resolve,reject)=>{const css=doc.createElement('link');css.rel='stylesheet';css.href='https://api.mapbox.com/mapbox-gl-js/v3.33.0/mapbox-gl.css';doc.head.append(css);const script=doc.createElement('script');script.src='https://api.mapbox.com/mapbox-gl-js/v3.33.0/mapbox-gl.js';script.async=true;const timer=win.setTimeout(()=>{script.remove();reject(Error('Mapbox no respondió.'));},20000);script.onload=()=>{win.clearTimeout(timer);win.mapboxgl?resolve(win.mapboxgl):reject(Error('Mapbox no está disponible.'));};script.onerror=()=>{win.clearTimeout(timer);script.remove();reject(Error('No se ha podido cargar Mapbox.'));};doc.head.append(script);}).catch(error=>{mapboxSdkPromise=null;throw error;});return mapboxSdkPromise;
}


let googleMapsSdkPromise;
function loadGoogleMapsSdk(key, doc, win, onAuthFailure) {
 win.gm_authFailure = onAuthFailure;
 if (win.google?.maps?.importLibrary) return win.google.maps.importLibrary('maps');
 if (googleMapsSdkPromise) return googleMapsSdkPromise;
 googleMapsSdkPromise = new Promise((resolve, reject) => {
  const script = doc.createElement('script');
  const callback = 'copiloterGoogleMapsReady';
  const params = new URLSearchParams({key, v:'quarterly', loading:'async', callback, language:'es'});
  script.src = 'https://maps.googleapis.com/maps/api/js?' + params;
  script.async = true;
  const fail = () => {
   win.clearTimeout(timeout);
   script.remove();
   delete win[callback];
   reject(Error('Google Maps no respondió.'));
  };
  const timeout = win.setTimeout(fail, 20000);
  script.onerror = fail;
  win[callback] = () => {
   win.clearTimeout(timeout);
   delete win[callback];
   resolve(win.google.maps.importLibrary('maps'));
  };
  doc.head.append(script);
 }).catch(error => { googleMapsSdkPromise = null; throw error; });
 return googleMapsSdkPromise;
}

function initMapProvider(map,ign,env={window,document,navigator,storage:()=>localStorage,loadSdk:()=>loadMapboxSdk()}){
 const keys = readPersonalMapKeys(env.storage);
 const accessToken=env.accessToken??keys.mapbox??'',win=env.window,doc=env.document,root=doc.documentElement,select=doc.getElementById('mapProvider'),status=doc.getElementById('mapProviderStatus'),key='bus-copilot-map-provider';let preferred='ign',renderer=null,host=null,pending=null,ready=false,disposed=false,generation=0,frame=null,styleKey='',credited=false,loadTimer=null,failed=false,aerialFailed=false;
 const aerialFallback='No se han podido cargar las imágenes de Mapbox. Se muestra la vista aérea del IGN.';
 const attribution='<a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">© Mapbox</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://apps.mapbox.com/feedback/" target="_blank" rel="noopener">Mejorar mapa</a>';
 try{const saved=env.storage().getItem(key);if(['ign','mapbox','google'].includes(saved))preferred=saved;}catch{}

 const googleKey = env.googleKey ?? keys.google ?? '';
 const available = {ign:true,mapbox:accessToken.startsWith('pk.'),google:!!googleKey};
 for (const option of select.options || []) {
  option.hidden = option.disabled = !available[option.value];
 }
 if (!available[preferred]) preferred = 'ign';
 let googleMap, googleHost, googlePending, googleReady = false, googleFailed = false, googleTimer;
 const wantsGoogle = () => preferred === 'google' && env.navigator.onLine !== false;
 function syncGoogle() {
  if (!googleMap || !wantsGoogle() || googleFailed) return;
  const camera = mapboxCamera(map);
  googleMap.moveCamera({center:{lat:camera.center[1],lng:camera.center[0]},zoom:camera.zoom + 1,
   heading:((camera.bearing % 360) + 360) % 360,tilt:0});
 }
 function googleStyle() {
  return {street:'roadmap',aerial:'hybrid',topographic:'terrain'}[type()] || 'roadmap';
 }
 function googleFailure(message) {
  win.clearTimeout(googleTimer);
  googleFailed = true;
  if (!disposed && wantsGoogle()) showIgn(message);
 }
 function showGoogle() {
  if (disposed || !wantsGoogle() || googleFailed || !googleReady) return;
  if (googleMap.getRenderingType() !== 'VECTOR') {
   googleFailure('Google Maps no admite el giro del mapa en este dispositivo. Se muestra IGN.');
   return;
  }
  win.clearTimeout(googleTimer);
  syncGoogle();
  if (map.hasLayer(ign)) map.removeLayer(ign);
  googleHost.style.visibility = 'visible';
  root.dataset.mapProvider = 'google';
  setStatus('');
 }
 async function applyGoogle() {
  if (!googleKey || googleKey.startsWith('__')) {
   showIgn('Google Maps está pendiente de configuración. Se muestra IGN.');
   return;
  }
  if (googleFailed) {
   showIgn('Google Maps no está disponible. Se muestra IGN.');
   return;
  }
  if (googleMap) {
   googleMap.setMapTypeId(googleStyle());
   showGoogle();
   return;
  }
  if (googlePending) return;
  showIgn('Cargando Google Maps…');
  googlePending = true;
  try {
   const sdk = await (env.loadGoogleSdk || loadGoogleMapsSdk)(googleKey, doc, win,
    () => googleFailure('Google Maps rechazó la clave o la facturación. Se muestra IGN.'));
   if (disposed || !wantsGoogle() || googleFailed) return;
   googleHost = doc.createElement('div');
   googleHost.className = 'google-maps-background';
   googleHost.style.visibility = 'hidden';
   map.getContainer().prepend(googleHost);
   const center = map.getCenter();
   googleMap = new sdk.Map(googleHost, {center:{lat:center.lat,lng:center.lng},zoom:map.getZoom(),
    renderingType:sdk.RenderingType.VECTOR,mapTypeId:googleStyle(),disableDefaultUI:true,
    clickableIcons:false,gestureHandling:'none',keyboardShortcuts:false,isFractionalZoomEnabled:true});
   googleMap.addListener('tilesloaded', () => {googleReady = true;showGoogle();});
   googleTimer = win.setTimeout(() => googleFailure('Google Maps tardó demasiado. Se muestra IGN.'), 25000);
  } catch {
   googleFailure('No se ha podido cargar Google Maps. Se muestra IGN.');
  } finally { googlePending = false; }
 }

 function setStatus(text){status.textContent=text;status.hidden=!text;}
 function type(){return root.dataset.mapType||'street';}
 function dark(){return root.dataset.theme==='night';}
 function wantsMapbox(){return preferred==='mapbox'&&env.navigator.onLine!==false;}
 function clearLoadTimer(){if(loadTimer!==null)win.clearTimeout(loadTimer);loadTimer=null;}
 function showIgn(message=''){if(!map.hasLayer(ign))ign.addTo(map);if(host)host.style.visibility='hidden';if(googleHost)googleHost.style.visibility='hidden';if(credited){map.attributionControl?.removeAttribution(attribution);credited=false;}root.dataset.mapProvider='ign';setStatus(message);}
 function sync(){frame=null;if(wantsGoogle()){syncGoogle();return;}if(disposed||!renderer||!wantsMapbox())return;try{renderer.jumpTo(mapboxCamera(map));}catch{showIgn('Mapbox no está disponible. Mostrando IGN.');}}
 function schedule(){if(frame===null)frame=win.requestAnimationFrame(sync);}
 function showMapbox(){if(disposed||!ready||aerialFailed||!wantsMapbox())return;clearLoadTimer();renderer.resize();sync();if(map.hasLayer(ign))map.removeLayer(ign);host.style.visibility='visible';if(!credited){map.attributionControl?.addAttribution(attribution);credited=true;}root.dataset.mapProvider='mapbox';setStatus('');}
 function style(){if(!renderer)return;const next=type()+'|'+(type()==='street'&&dark());if(next===styleKey)return;styleKey=next;ready=false;failed=false;aerialFailed=false;showIgn('Cargando Mapbox…');renderer.setStyle(mapboxStyle(type(),dark()),{diff:false});}
 async function apply(){
  select.value=preferred;if(!map||!ign){select.disabled=true;return;}
  if(wantsGoogle()){generation++;if(root.dataset.mapProvider!=='google')showIgn('Cargando Google Maps…');await applyGoogle();return;}
  if(!wantsMapbox()){generation++;showIgn(preferred!=='ign'?'Sin conexión: se utiliza el mapa de IGN guardado en este dispositivo.':'');return;}
  if(root.dataset.mapProvider==='google')showIgn('Cargando Mapbox…');
  if(!accessToken.startsWith('pk.')){showIgn('Mapbox pendiente de configuración. Se mantiene IGN.');return;}
  if(renderer&&failed){renderer.remove();host?.remove();renderer=host=null;ready=false;failed=false;aerialFailed=false;styleKey='';clearLoadTimer();}
  if(renderer){style();if(aerialFailed)showIgn(aerialFallback);else if(ready)showMapbox();return;}
  if(pending)return;const token=++generation;setStatus('Cargando Mapbox…');
  pending=(async()=>{try{const sdk=await env.loadSdk();if(disposed||token!==generation||!wantsMapbox())return;if(!sdk.supported())throw Error('WebGL no disponible');
   host=doc.createElement('div');host.className='mapbox-background';host.style.visibility='hidden';host.setAttribute('aria-hidden','true');map.getContainer().prepend(host);
   renderer=new sdk.Map({container:host,accessToken,style:mapboxStyle(type(),dark()),...mapboxCamera(map),projection:'mercator',language:'es',interactive:false,attributionControl:false,logoPosition:'bottom-left',antialias:false,fadeDuration:0,renderWorldCopies:false,maxPitch:0});styleKey=type()+'|'+(type()==='street'&&dark());
   renderer.on('idle',()=>{if(!ready&&!aerialFailed){ready=true;failed=false;showMapbox();}});renderer.on('load',()=>{if(type()!=='aerial'&&!aerialFailed){ready=true;failed=false;showMapbox();}});
   renderer.on('error',event=>{
    if(type()==='aerial'&&(event.sourceId==='mapbox-satellite'||event.source?.id==='mapbox-satellite'||event.error?.url?.includes('/mapbox.satellite'))){
     aerialFailed=true;ready=false;clearLoadTimer();
     if(wantsMapbox())showIgn(aerialFallback);
    }else if(!ready&&!aerialFailed&&wantsMapbox()){failed=true;showIgn('No se ha podido cargar Mapbox. Se mantiene IGN.');}
   });
   renderer.on('webglcontextlost',()=>{ready=false;failed=true;if(wantsMapbox())showIgn('Mapbox ha perdido la imagen. Se mantiene IGN.');});renderer.on('webglcontextrestored',()=>{ready=true;failed=false;showMapbox();});
   loadTimer=win.setTimeout(()=>{loadTimer=null;if(!ready){failed=true;if(wantsMapbox())showIgn('Mapbox está tardando. Se mantiene IGN; puedes volver a seleccionarlo para reintentar.');}},25000);
  }catch{showIgn('Mapbox no está disponible en este dispositivo. Se mantiene IGN.');}finally{pending=null;if(!disposed&&token!==generation&&wantsMapbox())apply();}})();await pending;
 }
 function changed(){preferred=available[select.value]?select.value:'ign';try{env.storage().setItem(key,preferred);}catch{}apply();}
 function connectivity(){apply();}
 function styled(){if(renderer&&wantsMapbox())style();if(googleMap&&wantsGoogle())googleMap.setMapTypeId(googleStyle());}
 select.addEventListener('change',changed);win.addEventListener('online',connectivity);win.addEventListener('offline',connectivity);map.on('move zoom rotate',schedule);map.on('resize',()=>{if(renderer&&wantsMapbox()){renderer.resize();schedule();}});
 const observer=new win.MutationObserver(styled);observer.observe(root,{attributes:true,attributeFilter:['data-theme','data-map-type']});apply();
 return {refresh:apply,destroy(){disposed=true;generation++;clearLoadTimer();observer.disconnect();select.removeEventListener('change',changed);win.removeEventListener('online',connectivity);win.removeEventListener('offline',connectivity);map.off('move zoom rotate',schedule);if(frame!==null)win.cancelAnimationFrame(frame);renderer?.remove();host?.remove();win.clearTimeout(googleTimer);googleHost?.remove();showIgn();}};
}

let getFavouriteZoom;
const initialMapType=readMapType();
const map=typeof L!=='undefined'?L.map('map',{rotate:true,rotateControl:false,dragRotate:false,touchRotate:false,shiftKeyRotate:false,zoomControl:false,minZoom:0,maxZoom:19,zoomSnap:0,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([37.39,-5.99],12):null;
if(map){
 const MetricZoom=L.Control.Zoom.extend({_zoomIn(){changeMetricZoom(this._map,-10);},_zoomOut(){changeMetricZoom(this._map,10);}});
 new MetricZoom({position:'bottomright',zoomInTitle:'Acercar',zoomOutTitle:'Alejar'}).addTo(map);
 const MetreScale=L.Control.Scale.extend({onAdd(map){const container=L.Control.Scale.prototype.onAdd.call(this,map),button=document.createElement('button');button.type='button';button.className=this._mScale.className+' zoom-favourite';button.innerHTML=this._mScale.innerHTML;this._mScale.replaceWith(button);this._mScale=button;L.DomEvent.disableClickPropagation(container);L.DomEvent.disableScrollPropagation(container);getFavouriteZoom=bindFavouriteZoom(button,map);return container;},_updateMetric(maxMetres){const metres=roundedScaleMetres(maxMetres);this._updateScale(this._mScale,metres.toLocaleString('es')+' m',metres/maxMetres);}});
 const scale=new MetreScale({position:'bottomleft',imperial:false,maxWidth:110}).addTo(map);scale.getContainer().setAttribute('aria-label','Escala del mapa en metros');
 background=L.tileLayer(mapTileUrl(initialMapType),{maxZoom:19,maxNativeZoom:18,keepBuffer:1,updateWhenIdle:true,crossOrigin:true,attribution:'Mapa: <a href="https://www.ign.es/">IGN · CC BY 4.0</a>'});
 const notice=document.createElement('p');notice.className='hint';notice.setAttribute('role','status');notice.hidden=true;$('map').after(notice);
 background.on('tileerror',()=>{notice.hidden=false;notice.textContent='No se puede cargar parte del mapa de fondo. El recorrido, las paradas y las descargas GPX siguen disponibles.';});
 background.on('loading',()=>{notice.hidden=true;});let mapStatusTimer; background.on('load',()=>{clearTimeout(mapStatusTimer);mapStatusTimer=setTimeout(()=>updateOfflineStatus(),600);});background.addTo(map);
}else $('map').textContent='No se ha podido cargar el mapa. Puedes seguir descargando los GPX.';
function roundedScaleMetres(metres){return Math.max(10,Math.round(metres/10)*10);}
function scaleDistanceMetres(map){const y=map.getSize().y/2;return map.distance(map.containerPointToLatLng([0,y]),map.containerPointToLatLng([110,y]));}
function changeMetricZoom(map,delta){const distance=scaleDistanceMetres(map);if(!Number.isFinite(distance)||distance<=0)return;const current=roundedScaleMetres(distance),step=current>100||current===100&&delta>0?50:10;let target=Math.max(10,current+Math.sign(delta)*step);if(delta<0&&current>100&&target<100)target=100;setMetricZoomDistance(map,target);}
function setMetricZoomDistance(map,target){const distance=scaleDistanceMetres(map);if(!Number.isFinite(distance)||distance<=0||!Number.isFinite(target)||target<10)return;const zoom=map.getZoom()+Math.log2(distance/target);map.setZoom(Math.max(map.getMinZoom(),Math.min(map.getMaxZoom(),zoom)),{animate:false});}
function bindFavouriteZoom(button,map,storage){
 const key='bus-copilot-favourite-zoom-metres';let favourite=null,hold=null,ignoreClickUntil=0,origin=null;
 try{if(storage===undefined)storage=localStorage;const saved=Number(storage?.getItem(key));if(Number.isFinite(saved)&&saved>=10&&saved<=100000000)favourite=roundedScaleMetres(saved);}catch{}
 function describe(){const metres=roundedScaleMetres(scaleDistanceMetres(map));button.dataset.hasFavourite=String(favourite!==null);button.dataset.atFavourite=String(favourite!==null&&metres===favourite);const text=favourite===null?'Guardar '+metres+' m como zoom favorito':'Volver al zoom favorito: '+favourite+' m. Mantén pulsado para guardar el zoom actual';button.title=text;button.setAttribute('aria-label','Zoom actual: '+metres+' m. '+text);}
 function save(){const distance=scaleDistanceMetres(map);if(!Number.isFinite(distance)||distance<=0)return;favourite=roundedScaleMetres(distance);try{storage?.setItem(key,String(favourite));}catch{}describe();}
 function cancelHold(){if(hold!==null)clearTimeout(hold);hold=null;origin=null;}
 button.addEventListener('click',()=>{if(Date.now()<ignoreClickUntil)return;if(favourite===null)save();else setMetricZoomDistance(map,favourite);describe();});
 button.addEventListener('pointerdown',event=>{cancelHold();if(event.button!==undefined&&event.button!==0)return;origin=[event.clientX,event.clientY];hold=setTimeout(()=>{hold=null;ignoreClickUntil=Date.now()+1000;save();},650);});
 button.addEventListener('pointermove',event=>{if(origin&&Math.hypot(event.clientX-origin[0],event.clientY-origin[1])>10)cancelHold();});
 for(const name of ['pointerup','pointercancel','pointerleave'])button.addEventListener(name,cancelHold);
 button.addEventListener('contextmenu',event=>{event.preventDefault();cancelHold();ignoreClickUntil=Date.now()+1000;save();});
 map.on('zoomend',describe);map.on('moveend',describe);describe();
 return () => favourite;
}


function planRouteArrows(paths,project,spacing=110){
 const arrows=[];
 for(const path of paths||[]){let run=[];function flush(){if(run.length<2){run=[];return;}const cumulative=[0];for(let i=1;i<run.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(run[i].x-run[i-1].x,run[i].y-run[i-1].y));const length=cumulative.at(-1);let segment=1;function at(distance){distance=Math.max(0,Math.min(length,distance));while(segment<run.length-1&&cumulative[segment]<distance)segment++;while(segment>1&&cumulative[segment-1]>distance)segment--;const a=run[segment-1],b=run[segment],part=(distance-cumulative[segment-1])/(cumulative[segment]-cumulative[segment-1]);return {x:a.x+(b.x-a.x)*part,y:a.y+(b.y-a.y)*part};}
  for(let d=spacing/2;d<length-10;d+=spacing){const p=at(d),a=at(d-8),b=at(d+8),size=Math.hypot(b.x-a.x,b.y-a.y);if(size<1)continue;const x=(b.x-a.x)/size,y=(b.y-a.y)/size;arrows.push({x:p.x,y:p.y,points:[{x:p.x+x*8,y:p.y+y*8},{x:p.x-x*6-y*5,y:p.y-y*6+x*5},{x:p.x-x*6+y*5,y:p.y-y*6-x*5}]});}run=[];}
  for(const coordinate of path||[]){if(!Array.isArray(coordinate)||!Number.isFinite(coordinate[0])||!Number.isFinite(coordinate[1])||Math.abs(coordinate[0])>180||Math.abs(coordinate[1])>90){flush();continue;}const p=project(coordinate);if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)){flush();continue;}if(!run.length||Math.hypot(p.x-run.at(-1).x,p.y-run.at(-1).y)>.01)run.push(p);}flush();
 }
 return arrows;
}
function initRouteArrows(map,getRoute,env={document,window,storage:()=>localStorage,L}){
 const toggle=env.document.getElementById('routeArrows'),win=env.window,key='bus-copilot-route-arrows';let enabled=true,frame=null,cacheRoute=null,cacheZoom=null,planned=[],destroyed=false,drawnRoute=null,drawnZoom=null,drawnCenter=null,drawnSize=null;try{enabled=env.storage().getItem(key)!=='false';}catch{}toggle.checked=enabled;if(!map){toggle.disabled=true;return {refresh(){},destroy(){}};}
 const layer=env.L.layerGroup().addTo(map);
 function draw(){frame=null;if(destroyed||!enabled)return;const route=getRoute();if(!route?.geometry?.paths){layer.clearLayers();drawnRoute=null;return;}const zoom=map.getZoom(),center=map.project(map.getCenter(),zoom),size=map.getSize();if(route===drawnRoute&&zoom===drawnZoom&&drawnSize&&size.x===drawnSize.x&&size.y===drawnSize.y&&Math.hypot(center.x-drawnCenter.x,center.y-drawnCenter.y)<60)return;drawnRoute=route;drawnZoom=zoom;drawnCenter=center;drawnSize=size;layer.clearLayers();if(route!==cacheRoute||zoom!==cacheZoom){planned=planRouteArrows(route.geometry.paths,c=>map.project([c[1],c[0]],zoom));cacheRoute=route;cacheZoom=zoom;}
  const radius=Math.hypot(size.x,size.y)/2+100;const stops=(route.stops||[]).map(s=>map.project([s.geometry.y,s.geometry.x],zoom));let visible=0;
  for(const arrow of planned){if(Math.abs(arrow.x-center.x)>radius||Math.abs(arrow.y-center.y)>radius||stops.some(s=>Math.hypot(s.x-arrow.x,s.y-arrow.y)<15))continue;if(++visible>180)break;const points=arrow.points.map(p=>map.unproject(p,zoom));env.L.polygon(points,{color:'#244b3b',weight:1.3,opacity:1,fillColor:'#f5f7f5',fillOpacity:1,interactive:false,className:'route-direction-arrow'}).addTo(layer);}
 }
 function schedule(){if(frame===null&&!destroyed)frame=win.requestAnimationFrame(draw);}
 function change(){enabled=toggle.checked;drawnRoute=null;try{env.storage().setItem(key,String(enabled));}catch{}if(!enabled)layer.clearLayers();schedule();}
 toggle.addEventListener('change',change);map.on('zoomend moveend resize',schedule);schedule();return {refresh:schedule,destroy(){destroyed=true;if(frame!==null)win.cancelAnimationFrame(frame);toggle.removeEventListener('change',change);map.off('zoomend moveend resize',schedule);map.removeLayer(layer);}};
}

function terminalStopPath(point,radius){return 'M'+(point.x-radius)+','+(point.y-radius)+'h'+(radius*2)+'v'+(radius*2)+'h'+(-radius*2)+'z';}
function createRouteStop(latlng,options,terminal=false){
 if(!terminal)return L.circleMarker(latlng,options);
 if(!terminalStopRenderer){const SquareRenderer=L.SVG.extend({_updateCircle(layer){this._setPath(layer,layer._empty()?'M0 0':terminalStopPath(layer._point,layer._radius));}});terminalStopRenderer=new SquareRenderer();}
 return L.circleMarker(latlng,{...options,renderer:terminalStopRenderer,className:'route-terminal-stop'});
}
function updateStopMarkerSizes(){if(!map)return;const radius=$('gpsDetail').dataset.navigating==='true'&&map.getZoom()>=16?8:5;if(radius===stopMarkerRadius)return;stopMarkerRadius=radius;for(const marker of stopMarkers){marker.setRadius(radius);marker.setStyle({weight:radius===8?2.5:2});}}
if(map)map.on('zoomend',updateStopMarkerSizes);
function compareLineGroups(a,b){return a.id.localeCompare(b.id,'es',{numeric:true});}
function setLineIcon(element,group){element.textContent=group.id;const source=group.items[0].attributes.LineIcon;element.classList.toggle('has-line-icon',Boolean(source));if(!source)return;const img=document.createElement('img');img.src=source;img.alt='';img.width=40;img.height=40;const number=document.createElement('span');number.className='line-icon-number';number.textContent=group.id;element.replaceChildren(img,number);}
function renderList(){const q=$('search').value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');$('lines').replaceChildren();const filtered=groups.filter(g=>(!savedOnly||savedLines.has(g.id))&&(g.id+' '+g.name+' '+g.items.map(title).join(' ')).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q));$('count').textContent=filtered.length;for(const g of filtered){const b=document.createElement('button');b.className='line'+(g.id===selected?' active':'');b.setAttribute('aria-pressed',String(g.id===selected));const pill=document.createElement('span');pill.className='pill';setLineIcon(pill,g);const col=g.items[0].attributes.Color;applyLineColors(pill,col);const text=document.createElement('span'),name=document.createElement('strong');name.textContent=g.name;text.append(name);b.append(pill,text);b.onclick=()=>choose(g.id,true);$('lines').append(b);}if(!filtered.length){const p=document.createElement('p');p.className='empty';p.textContent='No hay líneas que coincidan con tu búsqueda.';$('lines').append(p);}}
function lineColors(value){const color=String(value||'').toLowerCase();const palette={'#f54129':{background:'#cf1b03',text:'#ffffff'},'#f7a800':{background:'#d18200',text:'#000000'},'#000d6f':{background:'#000049',text:'#ffffff'},'#84c6e3':{background:'#84c6e3',text:'#000000'}};return palette[color]||{background:/^#[0-9a-f]{6}$/.test(color)?color:'#244b3b',text:'#ffffff'};}
function applyLineColors(element,value){const colors=lineColors(value);element.style.backgroundColor=colors.background;element.style.borderColor=colors.background;element.style.color=colors.text;}
function setBadgeColor(value){applyLineColors($('badge'),value);}
function selectableRoutes(group){
 if(group.id!=='39')return group.items;
 // Keep one complete base itinerary per destination. Never join variant geometries or stops.
 const destinations=new Map();
 for(const f of [...group.items].sort((a,b)=>Number(a.attributes.Ruta)-Number(b.attributes.Ruta))){const dest=String(f.attributes.DestinoRuta||f.stops?.at(-1)?.attributes.Nodo||f.attributes.NombreRuta).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.\s]+/g,' ').trim().toUpperCase();if(!destinations.has(dest))destinations.set(dest,f);}
 return [...destinations.values()];
}
async function useSavedMapForLine(id){if(navigator.onLine!==false||$('mapType').disabled)return;try{const packs=await BusOffline.savedMapPacks(id);if(selected!==id||!packs.length||packs.some(p=>p.type===readMapType()))return;$('mapType').value=packs[0].type;$('mapType').dispatchEvent(new Event('change'));}catch{}}
function choose(id,navigate=false){if(routeNavigator.isActive())routeNavigator.exit();selected=id;const g=groups.find(g=>g.id===id);$('name').textContent=g.name;setLineIcon($('badge'),g);setBadgeColor(g.items[0].attributes.Color);$('variant').replaceChildren();selectableRoutes(g).forEach((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=f.attributes.NombreRuta||f.attributes.DestinoRuta;$('variant').append(o)});$('variant').disabled=false;$('badge').hidden=false;$('senseBar').hidden=false;renderList();show();closeMenus(true);if(navigate)routeNavigator.start();}
function show(importedRoute=null){clearGpxDownloads();const g=groups.find(g=>g.id===selected);current=importedRoute||selectableRoutes(g)[Number($('variant').value)];if(map){if(routeLayer)map.removeLayer(routeLayer);stopMarkers=[];stopMarkerRadius=null;routeLayer=L.featureGroup().addTo(map);for(const path of current.geometry.paths){const pts=path.map(c=>[c[1],c[0]]);L.polyline(pts,{color:'#315e46',weight:5,opacity:.9}).addTo(routeLayer);}const stopStyle={radius:5,color:'#244b3b',weight:2,fillColor:'#e2f3a2',fillOpacity:1};const stops=current.stops||[];for(const [i,s] of stops.entries()){const terminal=!importedRoute&&(i===0||i===stops.length-1),label=document.createElement('span');label.textContent=(terminal?'Cabecera · ':'')+(i+1)+'. '+s.attributes.Nombre+' (parada '+s.attributes.Nodo+')';stopMarkers.push(createRouteStop([s.geometry.y,s.geometry.x],stopStyle,terminal).bindTooltip(label).addTo(routeLayer));}if(!stops.length){const paths=current.geometry.paths.filter(path=>path.length);if(paths.length){stopMarkers.push(createRouteStop([paths[0][0][1],paths[0][0][0]],stopStyle,true).bindTooltip('Cabecera · Inicio del recorrido').addTo(routeLayer));const last=paths.at(-1).at(-1);stopMarkers.push(createRouteStop([last[1],last[0]],stopStyle,true).bindTooltip('Cabecera · Final del recorrido').addTo(routeLayer));}}
map.fitBounds(routeLayer.getBounds(),{paddingTopLeft:[24,140],paddingBottomRight:[24,38],animate:false});const favourite=getFavouriteZoom?.();if(!importedRoute&&favourite!=null)setMetricZoomDistance(map,favourite);routeArrowsController?.refresh();}$('stopList').replaceChildren();for(const s of current.stops||[]){const li=document.createElement('li');li.textContent=s.attributes.Nombre+' · parada '+s.attributes.Nodo;$('stopList').append(li);}$('stopCount').textContent=(current.stops||[]).length+' paradas en este recorrido';$('stats').textContent=distance(current).toLocaleString('es',{maximumFractionDigits:1})+' km · '+current.geometry.paths.reduce((n,p)=>n+p.length,0)+' puntos · '+(current.stops||[]).length+' paradas';$('download').disabled=Boolean(importedRoute);routeNavigator.routeChanged();updateStopMarkerSizes();if(!importedRoute)useSavedMapForLine(selected);}

function parseGpxRoute(source, filename) {
 if (/<!DOCTYPE/i.test(source)) throw Error('El archivo GPX contiene una declaración no admitida.');
 const xml = new DOMParser().parseFromString(source, 'application/xml');
 const root = xml.documentElement;
 if (root?.localName !== 'gpx' || xml.getElementsByTagNameNS('*', 'parsererror').length) {
  throw Error('El archivo no es un GPX válido.');
 }
 const children = (element, name) => Array.from(element.children).filter(child => child.localName === name);
 const firstName = element => element && children(element, 'name')[0]?.textContent.trim();
 function coordinate(point) {
  const lat = point.getAttribute('lat')?.trim(), lon = point.getAttribute('lon')?.trim();
  if (!lat || !lon || !Number.isFinite(+lat) || !Number.isFinite(+lon) || Math.abs(+lat) > 90 || Math.abs(+lon) > 180) {
   throw Error('El GPX contiene coordenadas no válidas.');
  }
  return [+lon, +lat];
 }
 const tracks = children(root, 'trk'), routes = children(root, 'rte');
 const paths = tracks.flatMap(track => children(track, 'trkseg').map(segment => children(segment, 'trkpt').map(coordinate)));
 paths.push(...routes.map(route => children(route, 'rtept').map(coordinate)));
 const usablePaths = paths.filter(path => path.length >= 2);
 if (!usablePaths.length) throw Error('El GPX debe contener un recorrido con al menos dos puntos consecutivos.');
 const name = (firstName(children(root, 'metadata')[0]) || firstName(tracks[0]) ||
  firstName(routes[0]) || filename.replace(/\.gpx$/i, '') || 'Recorrido GPX').slice(0, 100);
 const stops = children(root, 'wpt').map((point, index) => {
  const [x, y] = coordinate(point);
  return {geometry:{x,y},attributes:{Nombre:(firstName(point) || 'Punto ' + (index + 1)).slice(0, 100),Nodo:index + 1}};
 });
 return {attributes:{NombreRuta:name},geometry:{paths:usablePaths},stops};
}

function openCustomRoute(route) {
 if (!map) throw Error('El mapa no está disponible.');
 if (routeNavigator.isActive()) routeNavigator.exit();
 selected = '';
 $('name').textContent = route.attributes.NombreRuta;
 $('badge').hidden = true;
 $('senseBar').hidden = true;
 $('variant').disabled = true;
 renderList();
 show(route);
 closeMenus();
}

function initGpxImport() {
 const input = $('gpxImportFile'), button = $('importGpx'), status = $('gpxImportStatus');
 button.onclick = () => input.click();
 input.onchange = async () => {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  status.hidden = false;
  status.textContent = 'Leyendo el archivo GPX…';
  button.disabled = true;
  try {
   if (!map) throw Error('El mapa no está disponible.');
   if (file.size > 10 * 1024 * 1024) throw Error('El GPX supera el límite de 10 MB.');
   const route = parseGpxRoute(await file.text(), file.name);
   openCustomRoute(route);
   status.textContent = 'GPX abierto en el mapa.';
  } catch (error) {
   status.textContent = error.message || 'No se pudo leer el archivo GPX.';
  } finally {
   button.disabled = false;
  }
 };
}

let gpxDownloadUrls=[];
function clearGpxDownloads(){for(const url of gpxDownloadUrls)setTimeout(()=>URL.revokeObjectURL(url),30000);gpxDownloadUrls=[];$('gpxFiles').replaceChildren();$('gpxFiles').hidden=true;$('downloadStatus').hidden=true;$('downloadStatus').textContent='';}
function lineGpxRoutes(group,route){const routes=selectableRoutes(group),variant=routes.filter(f=>f.attributes.Sublinea===route?.attributes.Sublinea);return variant.length?variant:routes;}
function downloadLineGpx(){const group=groups.find(g=>g.id===selected);if(!group||!current)return;clearGpxDownloads();const routes=lineGpxRoutes(group,current);for(const f of routes){const file=download([f],routeFilename(f,features)),link=document.createElement('a');link.href=URL.createObjectURL(file.blob);gpxDownloadUrls.push(link.href);link.download=file.name;link.textContent=f.attributes.NombreRuta||file.name;$('gpxFiles').append(link);}$('gpxFiles').hidden=false;$('downloadStatus').hidden=false;$('downloadStatus').textContent='Descarga iniciada: '+routes.length+' archivos, uno por sentido. Si falta alguno, descárgalo aquí:';}
function download(items,name){const blob=new Blob([gpx(items)],{type:'application/gpx+xml;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeFilename(name)+'.gpx';a.click();const feedback=$('downloadStatus');feedback.textContent='Descarga iniciada: '+a.download;feedback.hidden=false;setTimeout(()=>URL.revokeObjectURL(url),30000);return {name:a.download,blob};}
async function attachStops(data){let all=[];for(let offset=0;;offset+=2000){const r=await fetch('https://services1.arcgis.com/hcmP7kr0Cx3AcTJk/ArcGIS/rest/services/TUSSAM_Paradas/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json&orderByFields=ObjectId&resultRecordCount=2000&resultOffset='+offset,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('No se pudieron consultar las paradas');const d=await r.json();if(d.error||!d.features?.length)throw Error('Paradas incompletas');all.push(...d.features);if(!d.exceededTransferLimit)break;if(offset>20000)throw Error('Demasiadas paradas');}
for(const f of data.features){f.stops=all.filter(s=>['Package','Linea','Ruta','Sublinea'].every(k=>s.attributes[k]===f.attributes[k])).sort((a,b)=>a.attributes.Distancia-b.attributes.Distancia);if(!f.stops.length||f.stops.some(s=>!Number.isFinite(s.geometry?.x)||!Number.isFinite(s.geometry?.y)||Math.abs(s.geometry.x)>180||Math.abs(s.geometry.y)>90))throw Error('Paradas no válidas');}}
async function load(refresh=false){
 $('refresh').disabled=true;$('dataStatus').dataset.state='loading';$('status').textContent=refresh?'Consultando la fuente pública…':'Abriendo recorridos guardados…';let data,message,state='cached';
 try{
  if(refresh){
   if(navigator.onLine===false)throw Error('Sin conexión');
   const r=await fetch(SOURCE+'/query?where=1%3D1&outFields=*&outSR=4326&f=json',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);data=await r.json();validFeatures(data);await attachStops(data);data.fetchedAt=new Date().toISOString();
   await BusOffline.saveDataset(data).catch(()=>{});state='live';message='Trazados y paradas consultados ahora · '+new Date().toLocaleString('es-ES');
  }else{try{data=await BusOffline.savedDataset();if(data)validFeatures(data);}catch{data=null;}if(!data){const r=await fetch('snapshot.json');if(!r.ok)throw Error();data=await r.json();}validFeatures(data);message='Datos locales · '+new Date(data.fetchedAt).toLocaleDateString('es-ES');}
 }catch{
  try{data=await BusOffline.savedDataset();if(data)validFeatures(data);}catch{data=null;}
  try{if(!data){const r=await fetch('snapshot.json');if(!r.ok)throw Error();data=await r.json();}validFeatures(data);message='Sin datos nuevos. Copia local del '+new Date(data.fetchedAt).toLocaleDateString('es-ES');}
  catch{$('dataStatus').dataset.state='error';$('status').textContent='No se pueden cargar los datos. Comprueba la conexión y pulsa Actualizar.';$('refresh').disabled=false;return;}
 }
 data=withoutRetiredTestRoutes(data);
 latestOfflineDataset=data;automaticNetwork?.setData(data);
 if(routeNavigator.isActive()&&current){$('dataStatus').dataset.state=state;$('status').textContent='Datos disponibles para la próxima selección. Tu navegación continúa con el recorrido actual.';$('refresh').disabled=false;return;}
 features=validFeatures(data);const index=new Map;for(const f of features){const id=label(f);if(!index.has(id))index.set(id,{id,name:f.attributes.NombreLinea||id,items:[]});index.get(id).items.push(f);}groups=[...index.values()].sort(compareLineGroups);$('dataStatus').dataset.state=state;$('status').textContent=groups.length+' líneas · '+features.length+' recorridos · '+message;if(index.has(selected))choose(selected);else{renderList();routeNavigator.routeChanged();}$('refresh').disabled=false;}

function createLineStatistics(storage, onChange) {
 const key = 'copiloter-line-statistics';
 let route = null, checkpoints = [], next = 0, lastMatch = 0;
 let counts = readCounts();

 function readCounts() {
  try {
   const entries = JSON.parse(storage().getItem(key) || '[]');
   return new Map(entries.filter(([id, entry]) => typeof id === 'string' &&
    typeof entry?.name === 'string' && Number.isSafeInteger(entry.count) && entry.count > 0));
  } catch {
   return new Map();
  }
 }

 function routeCheckpoints(feature) {
  const points = [];
  let travelled = 0;
  for (const path of feature.geometry.paths) {
   for (let i = 0; i < path.length; i++) {
    if (i) travelled += gpsDistance(path[i - 1], path[i]);
    points.push({coordinate: path[i], travelled});
   }
  }
  if (travelled < 200) return [];
  const samples = [points[0].coordinate];
  const intervals = Math.max(4, Math.ceil(travelled / 400));
  let i = 1;
  for (let step = 1; step < intervals; step++) {
   const target = travelled * step / intervals;
   while (points[i].travelled < target) i++;
   const start = points[i - 1], end = points[i];
   const fraction = (target - start.travelled) / (end.travelled - start.travelled);
   samples.push(start.coordinate.map((value, axis) => value + fraction * (end.coordinate[axis] - value)));
  }
  samples.push(points.at(-1).coordinate);
  return samples;
 }

 return {
  entries() {
   return [...counts].sort(([a, x], [b, y]) => y.count - x.count || (x.line || a).localeCompare(y.line || b, 'es', {numeric:true}) || (x.sense || '').localeCompare(y.sense || '', 'es'));
  },
  addPosition(feature, fix) {
   if (route !== feature) {
    route = feature;
    checkpoints = feature ? routeCheckpoints(feature) : [];
    next = 0;
    lastMatch = 0;
   }
   if (!checkpoints.length || fix.accuracy > 50 || fix.time <= lastMatch) return;
   if (next && fix.time - lastMatch > 30 * 60 * 1000) next = 0;
   if (gpsDistance([fix.lon, fix.lat], checkpoints[next]) > 65) return;
   lastMatch = fix.time;
   if (++next < checkpoints.length) return;
   next = 0;
   const id = label(feature);
   const stored = readCounts();
   for (const [line, entry] of stored) {
    if (entry.count > (counts.get(line)?.count || 0)) counts.set(line, entry);
   }
   const sense = feature.attributes.NombreRuta || feature.attributes.DestinoRuta || 'Sentido ' + feature.attributes.Ruta;
   const directionKey = JSON.stringify([id, sense]);
   counts.set(directionKey, {line: id, sense, name: feature.attributes.NombreLinea || id,
    count: (counts.get(directionKey)?.count || 0) + 1});
   try { storage().setItem(key, JSON.stringify([...counts])); } catch {}
   onChange();
  }
 };
}

function renderLineStatistics() {
 const list = $('statisticsList');
 const entries = lineStatistics.entries();
 list.replaceChildren();
 $('statisticsEmpty').hidden = entries.length > 0;
 const max = entries[0]?.[1].count || 1;
 for (const [id, entry] of entries) {
  const row = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = 'Línea ' + (entry.line || id) + ' · ' + (entry.sense || entry.name + ' (sentido sin registrar)');
  const count = document.createElement('strong');
  count.textContent = String(entry.count);
  count.setAttribute('aria-label', entry.count + (entry.count === 1 ? ' semivuelta' : ' semivueltas'));
  const bar = document.createElement('div');
  bar.className = 'statistics-bar';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span');
  fill.style.width = (100 * entry.count / max) + '%';
  bar.append(fill);
  row.append(name, count, bar);
  list.append(row);
 }
}
const lineStatistics=createLineStatistics(()=>localStorage,renderLineStatistics);

function initNextStop() {
 const toggle = $('showNextStop'), panel = $('nextStop');
 const name = $('nextStopName'), distance = $('nextStopDistance');
 const preference = 'copiloter-show-next-stop';
 let route = null, track = null, result = null, expiry;
 try { toggle.checked = localStorage.getItem(preference) !== 'false'; } catch {}

 function render() {
  panel.hidden = !toggle.checked || !result;
  if (panel.hidden) return;
  const metres = result.metres < 20 ? Math.round(result.metres) : Math.round(result.metres / 10) * 10;
  const text = metres >= 1000 ? (metres / 1000).toLocaleString('es-ES', {maximumFractionDigits:1}) + ' km' : metres + ' m';
  if (name.textContent !== result.name) name.textContent = result.name;
  if (distance.textContent !== text) distance.textContent = text;
 }

 toggle.onchange = () => {
  try { localStorage.setItem(preference, String(toggle.checked)); } catch {}
  render();
 };

 return {
  reset() {
   clearTimeout(expiry);
   route = track = result = null;
   render();
  },
  update(currentRoute, fix) {
   if (route !== currentRoute) {
    route = currentRoute;
    track = route?.stops?.length ? createNextStopTracker(route) : null;
   }
   result = track?.(fix) ?? null;
   clearTimeout(expiry);
   if (result) expiry = setTimeout(() => { result = null; render(); }, 30000);
   render();
  }
 };
}


let latestGpsFix = null;

function renderGpsInformation() {
 const fix = latestGpsFix;
 const panel = $('gpsInformationView');
 panel.hidden = !$('showGpsInformation').checked || !fix;
 if (panel.hidden) return;
 const values = {
  gpsInfoAltitude: Number.isFinite(fix?.altitude) ? Math.round(fix.altitude) + ' m' : '—',
  gpsInfoSpeed: Number.isFinite(fix?.speed) ? Math.round(fix.speed * 3.6) + ' km/h' : '—',
  gpsInfoAccuracy: fix ? Math.round(fix.accuracy) + ' m' : '—',
  gpsInfoHeading: Number.isFinite(fix?.heading) ? Math.round(fix.heading) % 360 + '°' : '—',
  gpsInfoPosition: fix ? fix.lat.toFixed(5) + ', ' + fix.lon.toFixed(5) : '—',
  gpsInfoTime: fix ? new Date(fix.time).toLocaleTimeString('es-ES') : '—'
 };
 for (const [id, text] of Object.entries(values)) {
  const field = $(id);
  if (field.textContent !== text) field.textContent = text;
 }
}

function initGpsInformationVisibility() {
 const toggle = $('showGpsInformation');
 const key = 'copiloter-show-gps-information';
 try { toggle.checked = localStorage.getItem(key) !== 'false'; } catch {}
 toggle.onchange = () => {
  renderGpsInformation();
  try { localStorage.setItem(key, String(toggle.checked)); } catch {}
 };
}

const nextStop = initNextStop();
const routeNavigator=createRouteNavigator(map,()=>current,active=>{updateStopMarkerSizes();if(!active){nextStop.reset();latestGpsFix=null;renderGpsInformation();}},fix=>{latestGpsFix=fix;renderGpsInformation();nextStop.update(selected ? current : null,fix);recorder.addPosition(fix);if(!document.hidden)lineStatistics.addPosition(selected ? current : null,fix);},()=>current!=null&&getFavouriteZoom?.()!=null);
$('search').oninput=renderList;$('variant').onchange=()=>{if(routeNavigator.isActive())routeNavigator.exit();show();routeNavigator.start();};$('refresh').onclick=()=>load(true);$('download').onclick=downloadLineGpx;startOfflineApp();

function offlineNetworkFingerprint(data){let hash=2166136261;const value=JSON.stringify(data.features);for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16)+':'+value.length;}
function createAutomaticNetwork(env){
 const {window:win,document:doc,navigator:nav,bus}=env;let data=null,key='',completedKey='',controller=null,busy=false,destroyed=false,timer=null,shellReady=null,stage='waiting',progress={completed:0,total:0},retry=0,lastError='';
 const output=doc.getElementById('offlineStatus'),meter=doc.getElementById('autoOfflineProgress');
 function visible(){return doc.visibilityState!=='hidden';}
 function render(){const amount=new Set((data?.features||[]).map(f=>String(f.attributes.LabelLinea||f.attributes.Linea))).size,percent=progress.total?Math.floor(progress.completed/progress.total*100):0;let text=shellReady===false?'Este navegador no permite preparar la aplicación para abrirla sin conexión.':stage==='ready'?amount+' líneas y callejero IGN disponibles sin conexión.':stage==='routes'?'Guardando todas las líneas y paradas…':stage==='planning'?'Comprobando los mapas de toda la red…':stage==='maps'?'Preparando el callejero IGN de toda la red: '+percent+'%.':stage==='paused'?'Preparación en pausa'+(progress.total?' ('+percent+'%)':'')+'. Continuará al volver a abrir la app con conexión.':stage==='error'?'No se ha podido completar la preparación. '+lastError+' Se volverá a intentar.':'Preparando disponibilidad sin conexión…';if(output.textContent!==text)output.textContent=text;meter.hidden=!progress.total||stage==='ready';meter.max=progress.total||1;meter.value=progress.completed;}
 function clearTimer(){if(timer!==null)win.clearTimeout(timer);timer=null;}
 function schedule(delay=0){clearTimer();if(destroyed||!visible()||shellReady!==true||!data)return;timer=win.setTimeout(()=>{timer=null;run();},delay);}
 async function run(){if(destroyed||busy||!data||!visible()||shellReady!==true)return;const job=data,jobKey=key;controller=new AbortController();const signal=controller.signal;busy=true;
  function check(){if(signal.aborted||destroyed||jobKey!==key)throw Error('Preparación pausada.');}
  async function work(){check();stage='routes';render();await bus.persistence();check();await env.saveRoutes(job,signal);check();stage='planning';render();
   const result=await bus.saveNetworkMapPack(job.features,env.template(),{signal,fingerprint:jobKey,onProgress:p=>{if(!signal.aborted&&jobKey===key){progress=p;stage='maps';render();}}});check();progress={completed:result.count,total:result.count};completedKey=jobKey;stage='ready';retry=0;render();}
  try{if(nav.locks?.request)await nav.locks.request('bus-copilot-network-preparation',{signal},work);else await work();}
  catch(error){if(jobKey===key){if(signal.aborted||nav.onLine===false||!visible()){stage='paused';}else{stage='error';lastError=String(error?.message||error).slice(0,160);retry++;}render();}}
  finally{busy=false;controller=null;if(destroyed)return;if(key!==jobKey)schedule();else if(stage!=='ready'&&nav.onLine!==false&&visible())schedule(Math.min(300000,10000*2**Math.min(retry,5)));}
 }
 function resume(){if(!visible()){clearTimer();controller?.abort();if(stage!=='ready')stage='paused';render();return;}if(nav.onLine===false){clearTimer();controller?.abort();if(stage!=='ready')stage='paused';render();if(!busy&&data&&completedKey!==key)schedule();return;}if(completedKey!==key)schedule();else render();}
 win.addEventListener('online',resume);win.addEventListener('offline',resume);win.addEventListener('pageshow',resume);win.addEventListener('pagehide',()=>{clearTimer();controller?.abort();});doc.addEventListener('visibilitychange',resume);render();
 return {setData(value){const next=offlineNetworkFingerprint(value);data=value;if(next!==key){key=next;completedKey='';progress={completed:0,total:0};controller?.abort();stage='waiting';schedule();}render();},setShellReady(value){shellReady=!!value;render();if(shellReady)schedule();},refreshStatus:render,destroy(){destroyed=true;clearTimer();controller?.abort();win.removeEventListener('online',resume);win.removeEventListener('offline',resume);win.removeEventListener('pageshow',resume);doc.removeEventListener('visibilitychange',resume);}};
}
async function saveAutomaticRoutes(data,signal){
 const routes=validFeatures(data),index=new Map();await BusOffline.saveDataset(data);for(const f of routes){const id=label(f);if(!index.has(id))index.set(id,{id,name:f.attributes.NombreLinea||id,items:[]});index.get(id).items.push(f);}
 for(const group of index.values()){if(signal.aborted)throw Error('Preparación pausada.');const items=selectableRoutes(group),line={...group,automatic:true,savedAt:new Date().toISOString(),files:items.map(f=>({name:routeFilename(f,routes)+'.gpx',content:gpx([f])}))};await BusOffline.saveLine(line);savedLines.set(line.id,line);await new Promise(resolve=>setTimeout(resolve,0));}
}
async function updateOfflineStatus(){automaticNetwork?.refreshStatus();}
async function startOfflineApp(){
 try{savedLines=new Map((await BusOffline.savedLines()).map(line=>[line.id,line]));}catch{}
 await load();updateOfflineStatus();BusOffline.init().then(ready=>{if(ready&&background)background.redraw();automaticNetwork?.setShellReady(ready);});if(navigator.onLine!==false)load(true);
}

function showOptionsView(view='main',focus=true){const previous=$('optionsPanel').dataset.view;$('statisticsView').hidden=view!=='statistics';$('openStatistics').setAttribute('aria-expanded',String(view==='statistics'));if(view==='statistics')renderLineStatistics();$('recordingView').hidden=view!=='recording';$('openRecording').setAttribute('aria-expanded',String(view==='recording'));$('optionsMain').hidden=view!=='main';$('settingsView').hidden=view!=='settings';$('mapsView').hidden=view!=='maps';$('openMaps').setAttribute('aria-expanded',String(view==='maps'));$('displayView').hidden=view!=='display';$('openDisplay').setAttribute('aria-expanded',String(view==='display'));$('offlineView').hidden=view!=='offline';$('infoView').hidden=view!=='info';$('installView').hidden=view!=='install';$('optionsBack').hidden=view==='main';$('optionsBack').setAttribute('aria-label',view==='install'?'Volver a Información':view==='display'?'Volver a Ajustes':'Volver a opciones');const title={main:'Opciones',statistics:'Estadísticas',recording:'Rutas guardadas',settings:'Ajustes',maps:'Mapas',display:'Pantalla',offline:'Lista de Paradas',info:'Información',install:'Instalar aplicación'}[view];$('optionsTitle').textContent=title;$('optionsPanel').setAttribute('aria-label',title);$('optionsPanel').dataset.view=view;$('openSettings').setAttribute('aria-expanded',String(view==='settings'));$('openOffline').setAttribute('aria-expanded',String(view==='offline'));$('openInfo').setAttribute('aria-expanded',String(view==='info'));$('openInstall').setAttribute('aria-expanded',String(view==='install'));if(focus)$(view!=='main'?'optionsBack':previous==='offline'?'openOffline':previous==='info'?'openInfo':previous==='recording'?'openRecording':previous==='statistics'?'openStatistics':previous==='install'?'openInstall':previous==='maps'?'openMaps':'openSettings').focus({preventScroll:true});}
function closeMenus(restoreFocus=false){showOptionsView('main',false);const activePanel=!$('linePanel').hidden?'lines':!$('optionsPanel').hidden?'options':null;$('linePanel').hidden=true;$('optionsPanel').hidden=true;$('selectLine').setAttribute('aria-expanded','false');$('optionsToggle').setAttribute('aria-expanded','false');$('gpsDetail').dataset.menuOpen='false';routeNavigator.revealControls();if(restoreFocus&&activePanel)$(activePanel==='lines'?'selectLine':'optionsToggle').focus({preventScroll:true});}
function openMenu(which){const panel=$(which==='lines'?'linePanel':'optionsPanel'),wasOpen=!panel.hidden;closeMenus();if(wasOpen)return;panel.hidden=false;$(which==='lines'?'selectLine':'optionsToggle').setAttribute('aria-expanded','true');$('gpsDetail').dataset.menuOpen='true';routeNavigator.revealControls();$(which==='lines'?'closeLines':'closeOptions').focus({preventScroll:true});}
$('selectLine').onclick=()=>openMenu('lines');$('optionsToggle').onclick=()=>openMenu('options');$('closeLines').onclick=()=>closeMenus(true);$('closeOptions').onclick=()=>closeMenus(true);$('openSettings').onclick=()=>showOptionsView('settings');$('openMaps').onclick=()=>showOptionsView('maps');$('openDisplay').onclick=()=>showOptionsView('display');$('optionsBack').onclick=()=>showOptionsView($('optionsPanel').dataset.view==='install'?'info':$('optionsPanel').dataset.view==='display'?'settings':'main');$('openOffline').onclick=()=>showOptionsView('offline');$('openRecording').onclick=()=>showOptionsView('recording');$('openStatistics').onclick=()=>showOptionsView('statistics');$('openInfo').onclick=()=>showOptionsView('info');initGpsInformationVisibility();initGpxImport();$('openInstall').onclick=()=>showOptionsView('install');
document.addEventListener('pointerdown',event=>{if(event.target.closest('#map'))closeMenus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(!$('linePanel').hidden||!$('optionsPanel').hidden)){event.preventDefault();if($('optionsPanel').dataset.view!=='main')showOptionsView('main');else closeMenus(true);}});
$('optionsPanel').addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.closest('#savedRecordingList')&&!['openDisplay','closeOptions','openSettings','openMaps','openOffline','openInfo','openInstall','installAction','retryWake','retryGps','gpsDiagnosticButton','savePersonalMapKeys','openRecording','openStatistics','recordingToggle','recordingNew','recordingDownload','optionsBack','importGpx','download'].includes(button.id))closeMenus(true);});

function initMapViewport(map){
 const viewport=window.visualViewport,style=document.documentElement.style;let frame=null,lastWidth=0,lastHeight=0;
 function update(){frame=null;const width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;style.setProperty('--app-width',width+'px');style.setProperty('--app-height',height+'px');style.setProperty('--app-top',(viewport?.offsetTop||0)+'px');style.setProperty('--app-left',(viewport?.offsetLeft||0)+'px');if(width!==lastWidth||height!==lastHeight){lastWidth=width;lastHeight=height;map?.invalidateSize({pan:false,animate:false});}}
 function schedule(){if(frame===null)frame=requestAnimationFrame(update);}
 window.addEventListener('resize',schedule,{passive:true});window.addEventListener('orientationchange',schedule,{passive:true});window.addEventListener('pageshow',schedule,{passive:true});viewport?.addEventListener('resize',schedule,{passive:true});viewport?.addEventListener('scroll',schedule,{passive:true});update();
 return ()=>{if(frame!==null)cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('orientationchange',schedule);window.removeEventListener('pageshow',schedule);viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);};
}
initMapViewport(map);

// NOAA general solar-position equations; sunrise/sunset use a -0.833 degree solar elevation.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
function solarAltitude(now,latitude=37.3891,longitude=-5.9845){
 const date=new Date(now),year=date.getUTCFullYear(),start=Date.UTC(year,0,1),days=(Date.UTC(year+1,0,1)-start)/86400000;
 const gamma=2*Math.PI/days*((date.getTime()-start)/86400000-.5),radians=Math.PI/180;
 const equation=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
 const declination=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
 const minutes=date.getUTCHours()*60+date.getUTCMinutes()+date.getUTCSeconds()/60,solar=((minutes+equation+4*longitude)%1440+1440)%1440,hourAngle=(solar/4-180)*radians;
 const sine=Math.sin(latitude*radians)*Math.sin(declination)+Math.cos(latitude*radians)*Math.cos(declination)*Math.cos(hourAngle);
 return Math.asin(Math.max(-1,Math.min(1,sine)))/radians;
}
function nightTheme(mode,now){return mode==='night'||(mode!=='day'&&solarAltitude(now)<-.833);}
function initNightMode(now=()=>new Date()){
 const key='bus-sevilla-theme',select=document.getElementById('themeMode'),root=document.documentElement,meta=document.querySelector('meta[name="theme-color"]');
 const valid=value=>['auto','day','night'].includes(value)?value:'auto';let mode='auto';try{mode=valid(localStorage.getItem(key));}catch{}
 function apply(){const dark=nightTheme(mode,now());root.dataset.theme=dark?'night':'day';select.value=mode;if(meta)meta.setAttribute('content',dark?'#101c17':'#244b3b');}
 function change(){mode=valid(select.value);try{localStorage.setItem(key,mode);}catch{}apply();}
 function resume(){if(document.visibilityState!=='hidden')apply();}
 function stored(event){if(event.key===key||event.key===null){mode=valid(event.newValue);apply();}}
 select.addEventListener('change',change);document.addEventListener('visibilitychange',resume);window.addEventListener('pageshow',apply);window.addEventListener('storage',stored);
 const timer=setInterval(()=>{if(mode==='auto')apply();},60000);apply();
 return {refresh:apply,destroy(){clearInterval(timer);select.removeEventListener('change',change);document.removeEventListener('visibilitychange',resume);window.removeEventListener('pageshow',apply);window.removeEventListener('storage',stored);}};
}
initNightMode();

function initMapType(layer,initialType='street'){
 const select=document.getElementById('mapType'),root=document.documentElement,key='bus-sevilla-map-type';let preferred=validMapType(initialType),type=preferred;
 function apply(value){const next=validMapType(value);if(next!==type){layer?.setUrl(mapTileUrl(next));type=next;}select.value=type;root.dataset.mapType=type;}
 function connected(){const offline=window.navigator?.onLine===false;select.disabled=offline;apply(offline?'street':preferred);}
 function change(){preferred=validMapType(select.value);try{localStorage.setItem(key,preferred);}catch{}connected();}
 function stored(event){if(event.key===key||event.key===null){preferred=validMapType(event.newValue);connected();}}
 select.addEventListener('change',change);window.addEventListener('storage',stored);window.addEventListener('online',connected);window.addEventListener('offline',connected);connected();
 return ()=>{select.removeEventListener('change',change);window.removeEventListener('storage',stored);window.removeEventListener('online',connected);window.removeEventListener('offline',connected);};
}
initMapType(background,initialMapType);
initPersonalMapKeys();
initMapProvider(map,background);
routeArrowsController=initRouteArrows(map,()=>current);
automaticNetwork=createAutomaticNetwork({window,document,navigator,bus:BusOffline,saveRoutes:saveAutomaticRoutes,template:()=>mapTileUrl('street')});if(latestOfflineDataset)automaticNetwork.setData(latestOfflineDataset);
const recorder = initRouteRecording(() => routeNavigator.start());
// Start location independently of selecting or downloading a bus line.
routeNavigator.start();

// Installation stays in Options; no automatic prompt interrupts the map.
function initInstallation(win=window,nav=navigator,doc=document){
 const action=doc.getElementById('installAction'),status=doc.getElementById('installStatus'),steps=doc.getElementById('installSteps'),entry=doc.getElementById('installMenuLabel');
 const mode=win.matchMedia('(display-mode: standalone)'),ios=/iPad|iPhone|iPod/.test(nav.userAgent)||(/Macintosh/.test(nav.userAgent)&&nav.maxTouchPoints>1),android=/Android/.test(nav.userAgent);let pending=null,accepted=false,busy=false;
 function installed(){return !!(mode.matches||nav.standalone);}
 function render(){const active=installed();entry.textContent=active?'Aplicación instalada':'Instalar aplicación';action.hidden=active||accepted||!pending;action.disabled=busy;action.textContent=busy?'Abriendo instalación…':'Instalar aplicación';
  status.textContent=active?'Ya estás usando la aplicación desde su icono.':accepted?'Instalación solicitada. Busca «Copiloter» entre tus aplicaciones.':'';status.hidden=!status.textContent;
  steps.hidden=ios||android||active;steps.textContent='En el ordenador, abre el menú de Chrome o Edge y elige «Instalar Copiloter» si aparece.';
 }
 function before(event){event.preventDefault();pending=event;accepted=false;render();}
 function done(){pending=null;accepted=true;busy=false;render();}
 action.onclick=async()=>{if(!pending||busy)return;const prompt=pending;busy=true;render();try{await prompt.prompt();const choice=await prompt.userChoice;accepted=choice?.outcome==='accepted';}catch{status.textContent='No se ha podido abrir la instalación. Utiliza el menú del navegador.';}finally{pending=null;busy=false;render();}};
 win.addEventListener('beforeinstallprompt',before);win.addEventListener('appinstalled',done);win.addEventListener('pageshow',render);mode.addEventListener?.('change',render);render();
 return {refresh:render,destroy(){win.removeEventListener('beforeinstallprompt',before);win.removeEventListener('appinstalled',done);win.removeEventListener('pageshow',render);mode.removeEventListener?.('change',render);}};
}
initInstallation();

function initStopsMenuVisibility(env={document,storage:()=>localStorage}){const toggle=env.document.getElementById('showStopsMenu'),entry=env.document.getElementById('openOffline'),key='copiloter-show-stops-menu';let visible=true;try{visible=env.storage().getItem(key)!=='false';}catch{}function apply(){entry.hidden=!visible;toggle.checked=visible;}toggle.onchange=()=>{visible=toggle.checked;try{env.storage().setItem(key,String(visible));}catch{}apply();};apply();}
initStopsMenuVisibility();
function initZoomMetresVisibility(env={document,storage:()=>localStorage}){const toggle=env.document.getElementById('showZoomMetres'),root=env.document.documentElement,key='bus-copilot-show-zoom-metres';let visible=true;try{visible=env.storage().getItem(key)!=='false';}catch{}function apply(){root.dataset.zoomMetres=visible?'visible':'hidden';toggle.checked=visible;}toggle.onchange=()=>{visible=toggle.checked;try{env.storage().setItem(key,String(visible));}catch{}apply();};apply();}
initZoomMetresVisibility();

function initMenuIcon(env={document,storage:()=>localStorage}) {
 const toggle=env.document.getElementById('useMenuGear');
 const mascotChoice=env.document.getElementById('useMenuMascot');
 const mascot=env.document.getElementById('menuMascotIcon');
 const gear=env.document.getElementById('menuGearIcon');
 const key='copiloter-menu-icon';
 try { toggle.checked=env.storage().getItem(key)!=='mascot'; } catch {}
 mascotChoice.checked=!toggle.checked;
 function apply() {
  mascot.hidden=toggle.checked;
  gear.toggleAttribute('hidden',!toggle.checked);
 }
 toggle.onchange=mascotChoice.onchange=()=>{
  apply();
  try { env.storage().setItem(key,toggle.checked?'gear':'mascot'); } catch {}
 };
 apply();
}
initMenuIcon();

function initBusLinesVisibility() {
 const toggle=$('showBusLines');
 const key='copiloter-show-bus-lines';
 try { toggle.checked=localStorage.getItem(key)==='true'; } catch {}
 $('selectLine').hidden=!toggle.checked;
 toggle.onchange=()=>{
  $('selectLine').hidden=!toggle.checked;
  try { localStorage.setItem(key,String(toggle.checked)); } catch {}
  if (toggle.checked || !selected) return;
  selected='';
  current=null;
  routeLayer?.remove();
  routeLayer=null;
  stopMarkers=[];
  stopMarkerRadius=null;
  routeArrowsController?.refresh();
  $('name').textContent='Seleccionar línea';
  $('badge').hidden=true;
  $('senseBar').hidden=true;
  $('variant').disabled=true;
  $('stopList').replaceChildren();
  $('stopCount').textContent='0 paradas en este recorrido';
  $('stats').textContent='';
  $('download').disabled=true;
  clearGpxDownloads();
  renderList();
  routeNavigator.routeChanged();
 };
}
initBusLinesVisibility();

function initRouteRecording(startGps) {
 const key = 'copiloter-recorded-track';
 let storedValue;
 const toggle = $('recordingToggle');
 const downloadButton = $('recordingDownload');
 const newButton = $('recordingNew');
 const setting = $('showRecording');
 const mapButton = $('recordingMapButton');
 const list = $('savedRecordingList');
 let routes = [];
 let exampleAdded = false;
 const visibleRoutes = new Map();
 let nextNumber = 1;
 const waypointButton = $('recordingWaypoint');
 const waypointLayer = map ? L.layerGroup() : null;
 let waypoints = [];
 let latestFix = null;
 const settingKey = 'copiloter-show-recording';
 let enabled = false;
 try { enabled = localStorage.getItem(settingKey) === 'true'; } catch {}
 setting.checked = enabled;
 let points = [];
 let recording = false;
 let started = 0;
 let saved = true;
 let split = true;
 try {
  storedValue = localStorage.getItem(key);
  const stored = JSON.parse(storedValue || '[]');
  exampleAdded = stored?.exampleAdded === true;
  const validPoint = p => p && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.time) && Math.abs(p.time) <= 8640000000000000;
  const track = Array.isArray(stored) ? stored : stored?.points;
  if (Array.isArray(track)) points = track.filter(validPoint);
  if (Array.isArray(stored?.waypoints)) waypoints = stored.waypoints.filter(validPoint);
  if (Array.isArray(stored?.routes)) {
   routes = stored.routes.filter(route => route && typeof route.name === 'string' && Array.isArray(route.points) && Array.isArray(route.waypoints));
   nextNumber = Math.max(routes.filter(route => !route.example).length + 1, Number.isSafeInteger(stored.nextNumber) ? stored.nextNumber : 1);
  } else if (points.length) {
   archive();
  }
 } catch {}
 if (!exampleAdded) {
  const examplePoints = [
   [37.392003, -6.009209], [37.391555, -6.009326], [37.391199, -6.009406],
   [37.390686, -6.009551], [37.390706, -6.009664], [37.390792, -6.010147],
   [37.390743, -6.010236], [37.390566, -6.010512]
  ].map(([lat, lon], index) => ({lat, lon, time: Date.UTC(2026, 0, 1, 12, index)}));
  routes.push({name: 'Ruta de ejemplo (ficticia)', example: true, points: examplePoints,
   waypoints: [examplePoints[2], examplePoints[6]]});
  exampleAdded = true;
 }
 function drawWaypoints() {
  if (!waypointLayer) return;
  waypointLayer.clearLayers();
  if (!enabled) {
   waypointLayer.remove();
   return;
  }
  if (!map.hasLayer(waypointLayer)) waypointLayer.addTo(map);
  waypoints.forEach((point, index) => {
   L.circleMarker([point.lat, point.lon], {radius: 7, color: '#fff', weight: 2, fillColor: '#244b3b', fillOpacity: 1})
    .bindTooltip('Punto ' + (index + 1)).addTo(waypointLayer);
  });
 }
 function render() {
  mapButton.hidden = !enabled;
  waypointButton.hidden = !enabled || !recording;
  toggle.hidden = !enabled;
  mapButton.setAttribute('aria-pressed', String(recording));
  const action = recording ? 'Detener grabación' : points.length ? 'Continuar grabación' : 'Iniciar grabación';
  mapButton.setAttribute('aria-label', action);
  mapButton.title = action;
  $('recordingMenuLabel').textContent = recording ? '● Grabando ruta' : 'Rutas guardadas';
  toggle.textContent = recording ? 'Detener grabación' : points.length ? 'Continuar grabación' : 'Iniciar grabación';
  newButton.hidden = recording || !points.length;
  downloadButton.hidden = recording || !points.length;
  const status = recording ? (points.length ? 'Grabando · ' + points.length + ' puntos' : 'Esperando una posición GPS reciente…') : (points.length ? points.length + ' puntos en el borrador' : '');
  $('recordingStatus').textContent = status + (waypoints.length ? ' · ' + waypoints.length + ' marcas' : '') + (saved ? '' : ' · El navegador no ha podido guardar la ruta en este dispositivo.');
 }
 function save() {
  try {
   if (localStorage.getItem(key) !== storedValue) throw Error('La biblioteca cambió en otra pestaña');
   const updated = JSON.stringify({points, waypoints, routes, nextNumber, exampleAdded});
   localStorage.setItem(key, updated);
   storedValue = updated;
   saved = true;
  } catch { saved = false; }
  return saved;
 }
 function archive() {
  if (!points.length) return;
  const route = {name: 'Ruta ' + nextNumber, points, waypoints};
  routes.push(route);
  nextNumber++;
  points = [];
  waypoints = [];
  if (!save()) {
   routes.pop();
   nextNumber--;
   points = route.points;
   waypoints = route.waypoints;
  }
 }
 function renderLibrary() {
  list.replaceChildren();
  if (!routes.length) list.textContent = 'Todavía no hay rutas guardadas.';
  for (const route of routes) {
   const row = document.createElement('div');
   row.className = 'saved-recording-row';
   const title = document.createElement('button');
   title.type = 'button';
   title.className = 'saved-recording-title';
   title.textContent = route.name;
   title.setAttribute('aria-pressed', String(visibleRoutes.has(route)));
   title.disabled = !map || !route.points.length;
   title.onclick = () => {
    const existing = visibleRoutes.get(route);
    if (existing) {
     existing.remove();
     visibleRoutes.delete(route);
    } else {
     const paths = [];
     for (const point of route.points) {
      if (!paths.length || point.split) paths.push([]);
      paths.at(-1).push([point.lat, point.lon]);
     }
     const layer = L.featureGroup();
     for (const path of paths) {
      if (path.length === 1) L.circleMarker(path[0], {radius: 5, color: '#315e46'}).addTo(layer);
      else L.polyline(path, {color: '#315e46', weight: 5, opacity: .9}).addTo(layer);
     }
     route.waypoints.forEach((point, index) => {
      L.circleMarker([point.lat, point.lon], {radius: 5, color: '#244b3b', weight: 2, fillColor: '#e2f3a2', fillOpacity: 1})
       .bindTooltip('Punto ' + (index + 1)).addTo(layer);
     });
     layer.addTo(map);
     visibleRoutes.set(route, layer);
     map.fitBounds(layer.getBounds(), {padding: [30, 50], maxZoom: 17, animate: false});
    }
    title.setAttribute('aria-pressed', String(visibleRoutes.has(route)));
   };
   const rename = document.createElement('button');
   rename.type = 'button';
   rename.title = 'Editar nombre';
   rename.setAttribute('aria-label', 'Editar nombre');
   rename.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.9L20 7l-3-3L5 16l-1 4Z"/></svg>';
   rename.onclick = () => {
    const name = window.prompt('Nombre de la ruta', route.name)?.trim().slice(0, 100);
    if (!name || name === route.name) return;
    const previous = route.name;
    route.name = name;
    if (!save()) route.name = previous;
    renderLibrary();
    render();
   };
   const exportButton = document.createElement('button');
   exportButton.type = 'button';
   exportButton.title = 'Descargar GPX';
   exportButton.setAttribute('aria-label', 'Descargar GPX');
   exportButton.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>';
   exportButton.onclick = () => exportRoute(route);
   const deleteButton = document.createElement('button');
   deleteButton.type = 'button';
   deleteButton.title = 'Borrar';
   deleteButton.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3m3 0-1 14H7L6 6m4 4v6m4-6v6"/></svg>';
   deleteButton.setAttribute('aria-label', 'Borrar ' + route.name);
   deleteButton.onclick = () => {
    if (!window.confirm('¿Borrar «' + route.name + '» de tus rutas guardadas?')) return;
    const index = routes.indexOf(route);
    if (index === -1) return;
    routes.splice(index, 1);
    if (!save()) routes.splice(index, 0, route);
    else {
     visibleRoutes.get(route)?.remove();
     visibleRoutes.delete(route);
    }
    renderLibrary();
    render();
   };
   const actions = document.createElement('div');
   actions.className = 'saved-recording-actions';
   actions.append(rename, exportButton, deleteButton);
   row.append(title, actions);
   list.append(row);
  }
 }
 toggle.onclick = () => {
  if (!enabled) return;
  if (recording) {
   recording = false;
   archive();
   renderLibrary();
  } else {
   recording = true;
   latestFix = null;
   started = Date.now();
   split = true;
   startGps();
  }
  render();
 };
 if (map) {
  L.DomEvent.disableClickPropagation(mapButton);
  L.DomEvent.disableClickPropagation(waypointButton);
 }
 mapButton.onclick = toggle.onclick;
 waypointButton.onclick = () => {
  if (!recording) return;
  if (!latestFix || Date.now() - latestFix.time > 15000) {
   waypointButton.title = 'Espera una posición GPS reciente';
   waypointButton.setAttribute('aria-label', waypointButton.title);
   $('recordingStatus').textContent = waypointButton.title;
   return;
  }
  waypointButton.title = 'Añadir parada o punto';
  waypointButton.setAttribute('aria-label', waypointButton.title);
  waypoints.push({lat: latestFix.lat, lon: latestFix.lon, time: latestFix.time});
  drawWaypoints();
  save();
  render();
 };
 setting.onchange = () => {
  if (!setting.checked && recording) toggle.onclick();
  enabled = setting.checked;
  try { localStorage.setItem(settingKey, String(enabled)); } catch {}
  drawWaypoints();
  render();
 };
 newButton.onclick = () => {
  if (recording) return;
  archive();
  renderLibrary();
  render();
 };
 downloadButton.onclick = () => {
  if (!recording && points.length) exportRoute({name: 'Borrador Copiloter', points, waypoints});
 };
 function exportRoute({name, points, waypoints}) {
  let track = '<trkseg>';
  for (const [index, point] of points.entries()) {
   if (index && point.split) track += '</trkseg><trkseg>';
   track += '<trkpt lat="' + point.lat + '" lon="' + point.lon + '"><time>' + new Date(point.time).toISOString() + '</time></trkpt>';
  }
  const marks = waypoints.map((point, index) => '<wpt lat="' + point.lat + '" lon="' + point.lon + '"><time>' + new Date(point.time).toISOString() + '</time><name>Punto ' + (index + 1) + '</name></wpt>').join('');
  const xml = '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Copiloter" xmlns="http://www.topografix.com/GPX/1/1">' + marks + '<trk><name>' + esc(name) + '</name>' + track + '</trkseg></trk></gpx>';
  const url = URL.createObjectURL(new Blob([xml], {type: 'application/gpx+xml;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename(name) + '.gpx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
 }
 document.addEventListener('visibilitychange', () => { if (document.hidden) split = true; });
 drawWaypoints();
 renderLibrary();
 render();
 return {
  addPosition(fix) {
   if (!recording || document.hidden || fix.time < started || fix.accuracy > 80) return;
   latestFix = fix;
   const previous = points.at(-1);
   if (previous && fix.time <= previous.time) return;
   const newSegment = split || (previous && fix.time - previous.time > 30000);
   if (previous && !newSegment && (fix.time - previous.time < 3000 || gpsDistance([previous.lon, previous.lat], [fix.lon, fix.lat]) < 5)) return;
   points.push({lat: fix.lat, lon: fix.lon, time: fix.time, split: Boolean(newSegment)});
   split = false;
   save();
   render();
  }
 };
}

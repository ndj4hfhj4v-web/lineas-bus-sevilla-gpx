/* Device storage contains route data, never a history of GPS positions. */
const BusOffline=(()=>{
 let connection=null,registration=null;
 const DB='bus-sevilla-offline',VERSION=1;
 function open(){
  if(!globalThis.indexedDB)return Promise.reject(Error('Este navegador no permite guardar datos locales.'));
  if(!connection)connection=new Promise((resolve,reject)=>{const request=indexedDB.open(DB,VERSION);
   request.onupgradeneeded=()=>{for(const name of ['data','lines'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
   request.onerror=()=>{connection=null;reject(request.error);};request.onblocked=()=>{connection=null;reject(Error('Cierra otras pestañas de la app y vuelve a intentarlo.'));};
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
  });return connection;
 }
 async function run(store,mode,operation){const db=await open();return new Promise((resolve,reject)=>{const transaction=db.transaction(store,mode);let result;const request=operation(transaction.objectStore(store));request.onsuccess=()=>{result=request.result;};transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error||request.error);transaction.onabort=()=>reject(transaction.error||Error('No se ha completado el guardado.'));});}
 const savedLines=()=>run('lines','readonly',s=>s.getAll());
 const savedDataset=async()=>{const result=await run('data','readonly',s=>s.get('latest'));return result?.value||null;};
 const saveDataset=data=>run('data','readwrite',s=>s.put({id:'latest',value:data}));
 const saveLine=line=>run('lines','readwrite',s=>s.put(line));
 const removeLine=id=>run('lines','readwrite',s=>s.delete(id));
 // Explicit, user-requested route packs are kept apart from the temporary viewed-tile cache.
 const MAP_PACKS='bus-sevilla-map-packs-v1',RECENT_MAPS='bus-sevilla-tiles-v1';
 const PACK_ZOOMS=[11,12,13,14,15,16,17,18],PACK_MARGIN=3,MAX_PACK_TILES=3600,MAX_SAVED_MAP_TILES=12000;
 function mapPackKey(id,type){return 'map-pack:'+id+':'+type;}
 function planMapPack(items,template){
  const probe=new URL(template.replace('{z}','16').replace('{x}','31678').replace('{y}','25422'));
  const allowed={'/wmts/ign-base':'IGNBaseTodo','/wmts/pnoa-ma':'OI.OrthoimageCoverage','/wmts/mapa-raster':'MTN'};
  if(probe.origin!=='https://www.ign.es'||allowed[probe.pathname]!==probe.searchParams.get('LAYER'))throw Error('Proveedor de mapas no compatible.');
  const tiles=new Map();
  for(const z of PACK_ZOOMS){
   const n=2**z,visited=new Set();
   function point(c){if(!Number.isFinite(c[0])||!Number.isFinite(c[1])||c[0]<-6.2||c[0]>-5.7||c[1]<37.2||c[1]>37.65)throw Error('El recorrido queda fuera del área de mapas de Sevilla.');const lat=c[1]*Math.PI/180;return {x:(c[0]+180)/360*n,y:(1-Math.asinh(Math.tan(lat))/Math.PI)/2*n};}
   function add(p){const x0=Math.floor(p.x),y0=Math.floor(p.y),cell=x0+':'+y0;if(visited.has(cell))return;visited.add(cell);for(let dx=-PACK_MARGIN;dx<=PACK_MARGIN;dx++)for(let dy=-PACK_MARGIN;dy<=PACK_MARGIN;dy++){
    const x=x0+dx,y=y0+dy,lon=(x+.5)/n*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*(y+.5)/n)))*180/Math.PI;
    if(x<0||y<0||x>=n||y>=n||lon<-6.2||lon>-5.7||lat<37.2||lat>37.65)continue;
    const key=z+'/'+x+'/'+y;if(tiles.has(key))continue;const url=template.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));tiles.set(key,{url,z,x,y});
    if(tiles.size>MAX_PACK_TILES)throw Error('Esta línea necesita demasiados mapas para una sola descarga.');
   }}
   for(const f of items)for(const path of f.geometry.paths){if(!path.length)continue;let previous=point(path[0]);add(previous);for(const c of path.slice(1)){const next=point(c),steps=Math.max(1,Math.ceil(Math.max(Math.abs(next.x-previous.x),Math.abs(next.y-previous.y))*2));for(let i=1;i<=steps;i++)add({x:previous.x+(next.x-previous.x)*i/steps,y:previous.y+(next.y-previous.y)*i/steps});previous=next;}}
  }
  if(!tiles.size)throw Error('El recorrido no contiene un trazado válido.');return [...tiles.values()];
 }
 function usableMap(response){return !!response?.ok&&response.type!=='opaque'&&/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('content-type')||'')&&!/no-store|private/i.test(response.headers.get('cache-control')||'');}
 async function savedMapPacks(id){const records=await Promise.all(['street','aerial','topographic'].map(type=>run('data','readonly',s=>s.get(mapPackKey(id,type)))));return records.filter(r=>r?.value?.lineId===id).map(r=>r.value);}
 async function saveMapPack(id,type,items,template,{signal,onProgress=()=>{}}={}){
  if(!globalThis.caches)throw Error('Este navegador no permite guardar mapas.');
  const plan=planMapPack(items,template),cache=await caches.open(MAP_PACKS),recent=await caches.open(RECENT_MAPS),keys=new Set((await cache.keys()).map(k=>k.url));
  const missing=plan.filter(t=>!keys.has(t.url));if(keys.size+missing.length>MAX_SAVED_MAP_TILES)throw Error('No cabe otra línea de mapas. Borra mapas guardados o libera espacio.');
  await run('data','readwrite',s=>s.delete(mapPackKey(id,type)));
  let completed=0,index=0,downloaded=0,bytes=0,failed=false,gate=Promise.resolve(),lastNetwork=0;
  function check(){if(signal?.aborted)throw Error('Descarga cancelada. Puedes continuarla volviendo a guardar la línea.');if(failed)throw Error('Descarga interrumpida.');}
  function progress(){onProgress({completed,total:plan.length,downloaded,bytes});}
  function networkTurn(){const turn=gate.then(async()=>{check();const wait=Math.max(0,250-(Date.now()-lastNetwork));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));check();lastNetwork=Date.now();});gate=turn.catch(()=>{});return turn;}
  async function worker(){while(index<plan.length){check();const tile=plan[index++];try{
    let response=await cache.match(tile.url);
    if(!usableMap(response)){response=await recent.match(tile.url);if(!usableMap(response)){
      if(globalThis.navigator?.onLine===false)throw Error('Falta conexión para completar los mapas.');await networkTurn();
      const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,20000);
      try{response=await fetch(tile.url,{mode:'cors',signal:controller.signal});downloaded++;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
     }
     check();if(!usableMap(response))throw Error('No se ha recibido una imagen válida del mapa.');const data=await response.arrayBuffer();if(!data.byteLength||data.byteLength>512*1024)throw Error('La imagen del mapa no se puede guardar.');bytes+=data.byteLength;await cache.put(tile.url,new Response(data,{status:200,headers:response.headers}));
    }
    completed++;progress();
   }catch(error){failed=true;throw error;}}
  }
  progress();const results=await Promise.allSettled([worker(),worker()]);const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;check();
  // Verify durable cache entries, not just successful HTTP responses, before declaring the pack ready.
  const stored=new Set((await (await caches.open(MAP_PACKS)).keys()).map(k=>k.url));if(plan.some(t=>!stored.has(t.url)))throw Error('No se han conservado todos los mapas. Vuelve a guardar la línea.');
  const pack={lineId:id,type,count:plan.length,zooms:PACK_ZOOMS,savedAt:new Date().toISOString()};await run('data','readwrite',s=>s.put({id:mapPackKey(id,type),value:pack}));announce();return pack;
 }

 async function persistence(){try{return !!(await navigator.storage?.persist?.());}catch{return false;}}
 function announce(){window.dispatchEvent(new Event('bus-offline-change'));}
 async function init(){
  if(!window.isSecureContext||!('serviceWorker' in navigator)||location.protocol==='file:')return false;
  try{registration=await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});navigator.serviceWorker.addEventListener('controllerchange',announce);navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='MAP_STORAGE_WARNING')announce();});await navigator.serviceWorker.ready;announce();return true;}catch{return false;}
 }
 async function workerInfo(){const worker=navigator.serviceWorker?.controller||registration?.active;if(!worker)return {ready:false,tiles:0};return new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve({ready:false,tiles:0});},3000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);});}
 async function clearMaps(){if(!globalThis.caches)throw Error('La caché no está disponible.');await caches.delete('bus-sevilla-tiles-v1');await caches.delete(MAP_PACKS);const keys=await run('data','readonly',s=>s.getAllKeys());for(const key of keys)if(key.startsWith('map-pack:'))await run('data','readwrite',s=>s.delete(key));announce();}
 return {planMapPack,saveMapPack,savedMapPacks,init,savedLines,savedDataset,saveDataset,saveLine,removeLine,persistence,workerInfo,clearMaps};
})();
if(typeof module!=='undefined')module.exports=BusOffline;

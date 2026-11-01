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
 async function persistence(){try{return !!(await navigator.storage?.persist?.());}catch{return false;}}
 function announce(){window.dispatchEvent(new Event('bus-offline-change'));}
 async function init(){
  if(!window.isSecureContext||!('serviceWorker' in navigator)||location.protocol==='file:')return false;
  try{registration=await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});navigator.serviceWorker.addEventListener('controllerchange',announce);navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='MAP_STORAGE_WARNING')announce();});await navigator.serviceWorker.ready;announce();return true;}catch{return false;}
 }
 async function workerInfo(){const worker=navigator.serviceWorker?.controller||registration?.active;if(!worker)return {ready:false,tiles:0};return new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve({ready:false,tiles:0});},3000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);});}
 async function clearMaps(){if(!globalThis.caches)throw Error('La caché no está disponible.');await caches.delete('bus-sevilla-tiles-v1');announce();}
 return {init,savedLines,savedDataset,saveDataset,saveLine,removeLine,persistence,workerInfo,clearMaps};
})();
if(typeof module!=='undefined')module.exports=BusOffline;

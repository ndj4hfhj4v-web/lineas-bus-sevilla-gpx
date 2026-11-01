/* App shell version is replaced by the build. Route/GPX data lives in IndexedDB. */
const SHELL='bus-sevilla-shell-c1d511a2c5c0ebe3',TILES='bus-sevilla-tiles-v1';
const BASE=new URL('./',self.location.href),INDEX=new URL('index.html',BASE).href;
const ASSETS=['index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
const MAX_TILES=384,MAX_TILE_BYTES=512*1024;
function isMapTile(url){
 if(url.origin!=='https://www.ign.es'||url.pathname!=='/wmts/ign-base'||url.searchParams.get('REQUEST')!=='GetTile'||url.searchParams.get('LAYER')!=='IGNBaseTodo')return false;
 const z=Number(url.searchParams.get('TILEMATRIX')),x=Number(url.searchParams.get('TILECOL')),y=Number(url.searchParams.get('TILEROW'));
 if(!Number.isInteger(z)||z<11||z>18||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=2**z||y>=2**z)return false;
 const lon=(x+.5)/2**z*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*(y+.5)/2**z)))*180/Math.PI;
 return lon>=-6.2&&lon<=-5.7&&lat>=37.2&&lat<=37.65;
}
const missingTile=()=>new Response('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eaf0e7"/><path d="M0 0H256V256H0Z" fill="none" stroke="#cbd9d0"/><text x="128" y="128" text-anchor="middle" fill="#526459" font-size="12">Mapa no guardado</text></svg>',{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store'}});
let writes=Promise.resolve();const pending=new Map();let lastWarning=0;
async function warning(){if(Date.now()-lastWarning<30000)return;lastWarning=Date.now();for(const client of await self.clients.matchAll())client.postMessage({type:'MAP_STORAGE_WARNING'});}
async function trim(cache,maximum=MAX_TILES){const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-maximum)))await cache.delete(key);}
async function storeTile(request,response){
 if(response.type==='opaque'||!response.ok||/no-store|private/i.test(response.headers.get('cache-control')||'')||!response.headers.get('content-type')?.startsWith('image/'))return;
 const data=await response.clone().arrayBuffer();if(data.byteLength>MAX_TILE_BYTES)return;
 // Opaque responses can consume megabytes of quota per tile; only readable CORS responses are stored.
 const copy=new Response(data,{status:200,headers:response.headers});
 writes=writes.catch(()=>{}).then(async()=>{const cache=await caches.open(TILES);try{await cache.put(request,copy.clone());await trim(cache);}catch{await trim(cache,Math.floor(MAX_TILES/2));try{await cache.put(request,copy);}catch{await warning();}}});
 await writes;
}
async function mapTile(request,event){
 let cache,hit;try{cache=await caches.open(TILES);hit=await cache.match(request);}catch{/* Storage failure must not prevent the online map from loading. */}if(hit)return hit;
 if(pending.has(request.url))return (await pending.get(request.url)).clone();
 const task=(async()=>{try{const response=await fetch(request);if(!response.ok)return missingTile();event.waitUntil(storeTile(request,response).catch(warning));return response;}catch{return missingTile();}})();
 pending.set(request.url,task);try{return (await task).clone();}finally{pending.delete(request.url);}
}
async function shell(request){const cache=await caches.open(SHELL);const hit=await cache.match(INDEX);if(hit)return hit;return fetch(request);}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(ASSETS.map(path=>new Request(new URL(path,BASE).href,{cache:'reload'})));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('bus-sevilla-shell-')&&name!==SHELL)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);
 if(request.mode==='navigate'&&url.origin===BASE.origin&&(url.pathname===BASE.pathname||url.href.split('?')[0]===INDEX)){event.respondWith(shell(request));return;}
 if(url.origin===BASE.origin&&ASSETS.some(path=>new URL(path,BASE).pathname===url.pathname)){event.respondWith((async()=>{const cache=await caches.open(SHELL);return await cache.match(url.href.split('?')[0])||fetch(request);})());return;}
 if(isMapTile(url))event.respondWith(mapTile(request,event));
});
self.addEventListener('message',event=>{if(event.data?.type==='OFFLINE_STATUS')event.waitUntil((async()=>{try{const cache=await caches.open(TILES),app=await caches.open(SHELL);event.ports[0]?.postMessage({ready:!!(await app.match(INDEX)),tiles:(await cache.keys()).length,limit:MAX_TILES});}catch{event.ports[0]?.postMessage({ready:false,tiles:0});}})());});

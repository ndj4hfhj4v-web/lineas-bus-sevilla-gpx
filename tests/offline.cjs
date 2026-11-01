const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('src/sw.js','utf8');
class MemoryCache{
 constructor(){this.values=new Map();}
 key(request){return typeof request==='string'?request:request.url;}
 async match(request){return this.values.get(this.key(request))?.clone();}
 async put(request,response){this.values.set(this.key(request),response.clone());}
 async delete(request){return this.values.delete(this.key(request));}
 async keys(){return [...this.values.keys()].map(url=>new Request(url));}
 async addAll(urls){for(const url of urls)await this.put(url,new Response(this.key(url).endsWith('index.html')?'CACHED APP':'asset'));}
}
const buckets=new Map(),listeners={};let online=true,requests=0;
const caches={open:async name=>{if(!buckets.has(name))buckets.set(name,new MemoryCache());return buckets.get(name);},keys:async()=>[...buckets.keys()],delete:async name=>buckets.delete(name)};
const scope='https://example.test/bus/';const ctx={URL,Request,Response,Map,Date,Math,Number,Promise,console,caches,fetch:async()=>{requests++;if(!online)throw Error('Airplane mode');return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}});},self:{location:{href:scope+'sw.js'},addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]}}};
vm.createContext(ctx);vm.runInContext(code,ctx);
function event(){const waiting=[];return {waiting,waitUntil:p=>waiting.push(p)};}
function tile(z=16,x=31678,y=25422){return new URL('https://www.ign.es/wmts/ign-base?REQUEST=GetTile&LAYER=IGNBaseTodo&TILEMATRIX='+z+'&TILECOL='+x+'&TILEROW='+y);}
(async()=>{
 const install=event();listeners.install(install);await Promise.all(install.waiting);
 assert(ctx.isMapTile(tile()),'Seville tile must be eligible');assert(!ctx.isMapTile(new URL('https://tile.openstreetmap.org/16/1/1.png')));assert(!ctx.isMapTile(tile(19)));assert(!ctx.isMapTile(tile(16,0,0)));
 const request=new Request(tile().href),first=event();let response=await ctx.mapTile(request,first);await Promise.all(first.waiting);assert.equal(response.status,200);assert.equal(requests,1);
 online=false;response=await ctx.mapTile(request,event());assert.equal(requests,1,'A saved tile is reused without a download');assert.equal((await response.arrayBuffer()).byteLength,3);
 const missing=await ctx.mapTile(new Request(tile(16,31679).href),event());assert.match(await missing.text(),/Mapa no guardado/,'Missing geography must be explicit');
 const shell=await ctx.shell(new Request(scope));assert.equal(await shell.text(),'CACHED APP','The app starts without a server');
 const cache=await caches.open('bus-sevilla-tiles-v1');for(let n=0;n<390;n++)await cache.put('https://example.test/tile/'+n,new Response('tile'));await ctx.trim(cache);assert.equal((await cache.keys()).length,384,'Map storage is bounded');
 const opaque={type:'opaque',ok:true};const before=(await cache.keys()).length;await ctx.storeTile(request,opaque);assert.equal((await cache.keys()).length,before,'Opaque quota-heavy responses are not stored');
 await caches.open('unrelated-cache');await caches.open('bus-sevilla-shell-old');const activation=event();listeners.activate(activation);await Promise.all(activation.waiting);assert(buckets.has('bus-sevilla-tiles-v1'));assert(buckets.has('unrelated-cache'));assert(!buckets.has('bus-sevilla-shell-old'));
 let status;const message=event();listeners.message({...message,data:{type:'OFFLINE_STATUS'},ports:[{postMessage:value=>{status=value;}}]});await Promise.all(message.waiting);assert.equal(status.ready,true);assert.equal(status.tiles,384);
 console.log('Correcto: arranque sin red, reutilización de mapas, huecos explícitos, límite de caché, actualización y conservación de datos.');
})().catch(error=>{console.error(error);process.exit(1);});

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('work/tussam/dist/app.js','utf8'),source=app.slice(app.indexOf("let mapDownload=null"),app.indexOf("$('savedOnly').onclick="));
const elements={saveOffline:{disabled:false,textContent:''},forgetOffline:{hidden:true},offlineStatus:{textContent:''}},savedLines=new Map();
const items=[{attributes:{Ruta:1}},{attributes:{Ruta:2}}];let saved,signalReceived;
const bus={persistence:async()=>false,saveLine:async line=>{saved=line;},workerInfo:async()=>({ready:true,packTiles:0}),savedMapPacks:async()=>[],saveMapPack:async()=>{throw Error('Sin conexión');}};
const context={AbortController,Map,Date,navigator:{onLine:true},BusOffline:bus,savedLines,features:items,selected:'05',groups:[{id:'05',name:'Prueba',items}],$:id=>elements[id],readMapType:()=> 'street',mapTileUrl:()=> 'template',selectableRoutes:g=>g.items,routeFilename:f=>'sentido-'+f.attributes.Ruta,gpx:()=>'<gpx/>'};
vm.runInNewContext(source,context);
(async()=>{
 await elements.saveOffline.onclick();assert.equal(saved.files.length,2);assert(savedLines.has('05'),'The route remains saved if its maps fail');assert.match(elements.offlineStatus.textContent,/mapas no están completos/);assert.equal(elements.saveOffline.disabled,false);
 bus.saveMapPack=async(id,type,routes,template,options)=>{assert.equal(routes.length,2);options.onProgress({completed:1,total:2});assert.match(elements.offlineStatus.textContent,/1\/2 mapas/);return {count:2};};
 await elements.saveOffline.onclick();assert.match(elements.offlineStatus.textContent,/mapa callejero guardados/);assert.equal(elements.saveOffline.textContent,'Guardar línea y mapas');
 bus.saveMapPack=async(id,type,routes,template,{signal})=>{signalReceived=signal;return new Promise((resolve,reject)=>{if(signal.aborted)reject(Error('Cancelada'));else signal.addEventListener('abort',()=>reject(Error('Cancelada')),{once:true});});};
 const pending=elements.saveOffline.onclick();for(let i=0;i<10&&!signalReceived;i++)await Promise.resolve();await elements.saveOffline.onclick();await pending;
 assert(signalReceived.aborted);assert.match(elements.offlineStatus.textContent,/mapas no están completos/);assert.equal(elements.saveOffline.disabled,false);assert(savedLines.has('05'));
 const select={value:'',dispatchEvent(){this.changed=(this.changed||0)+1;}},switcher={navigator:{onLine:false},selected:'05',readMapType:()=> 'aerial',BusOffline:{savedMapPacks:async()=>[{type:'street'}]},$:()=>select,Event:class Event{constructor(type){this.type=type;}}};vm.runInNewContext(app.slice(app.indexOf('async function useSavedMapForLine('),app.indexOf('function choose(')),switcher);await switcher.useSavedMapForLine('05');assert.equal(select.value,'street','Offline navigation selects an available saved background');assert.equal(select.changed,1);switcher.selected='31';await switcher.useSavedMapForLine('05');assert.equal(select.changed,1,'A late result cannot change a different selected line');
 console.log('Correcto: progreso, cancelación y confirmación honesta; una línea guardada no equivale a un mapa completo.');
})().catch(error=>{console.error(error);process.exit(1);});

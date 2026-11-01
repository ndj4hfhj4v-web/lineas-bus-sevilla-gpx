const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('src/app.js','utf8'),core=require('../src/core.js');
const snapshot=JSON.parse(fs.readFileSync('src/snapshot.json','utf8'));
const loadSource=src.slice(src.indexOf('async function load(refresh=false){'),src.indexOf("$('search').oninput="));
function elements(){return Object.fromEntries(['refresh','dataStatus','status','all','downloadStatus'].map(id=>[id,{disabled:false,dataset:{},textContent:'',hidden:true}]))}
async function checkLoad(mode){const el=elements();let calls=0,saves=0,choices=0,renders=0;
 const stored=['cached','local'].includes(mode)?structuredClone(snapshot):null;
 const savedItems=snapshot.features.filter(f=>Number(f.attributes.Linea)===5);
 const ctx={$:id=>el[id],SOURCE:'https://example.invalid',validFeatures:core.validFeatures,attachStops:async()=>{},label:f=>String(f.attributes.LabelLinea||f.attributes.Linea).padStart(2,'0'),features:[],groups:[],selected:'',choose:()=>{choices++},renderList:()=>{renders++},AbortSignal,navigator:{onLine:mode!=='local'},savedLines:new Map(mode==='local'?[['05',{items:savedItems}]]:[]),BusOffline:{savedDataset:async()=>stored,saveDataset:async()=>{saves++}},fetch:async()=>{calls++;if(mode==='error'||mode==='cached')throw Error('Source unavailable');return{ok:true,json:async()=>structuredClone(snapshot)}}};
 ctx.map=null;ctx.updateStopMarkerSizes=()=>{};ctx.createRouteNavigator=()=>({routeChanged(){},isActive:()=>mode==='active'});
 await vm.runInNewContext(loadSource+';load('+String(mode!=='local')+')',ctx);
 assert.equal(el.dataStatus.dataset.state,mode==='local'?'cached':mode==='active'?'live':mode);assert.equal(el.refresh.disabled,false);
 if(mode==='cached')assert.match(el.status.textContent,/Copia local/);
 if(mode==='live')assert.match(el.status.textContent,/consultados ahora/);
 if(mode==='error')assert.match(el.status.textContent,/No se pueden cargar/);
 if(mode==='local'){assert.equal(calls,0,'Offline startup never waits for network');assert.equal(choices,0,'Startup must leave the map without a selected line');assert.equal(renders,1);assert(ctx.groups.some(g=>g.id==='05'));}
 if(mode==='active'){assert.equal(choices,0,'Updating data must not interrupt GPS');assert.equal(saves,1);}
}
(async()=>{for(const mode of ['live','cached','error','local','active'])await checkLoad(mode);
const el=elements();let clicks=0;const anchor={click(){clicks++}},routes=snapshot.features.filter(f=>f.attributes.Linea===5);const ctx={gpx:core.gpx,safeFilename:core.safeFilename,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},document:{createElement:()=>anchor},$:id=>el[id],setTimeout:()=>{}};
vm.runInNewContext(src.slice(src.indexOf('function download('),src.indexOf('async function attachStops')),ctx);ctx.download([routes[0]],'05 - Puerta Triana - Santa Aurelia');assert.equal(clicks,1);assert.equal(el.downloadStatus.hidden,false);assert.equal(el.downloadStatus.textContent,'Descarga iniciada: 05 - Puerta Triana - Santa Aurelia.gpx');
console.log('Correcto: datos en directo, copia guardada, error de carga y confirmación de descarga.');})().catch(e=>{console.error(e);process.exit(1)});

const markerProbe={setRadius(n){this.radius=n;},setStyle(s){this.weight=s.weight;}};const stateProbe={dataset:{navigating:'false'}};const zoomProbe={zoom:12,getZoom(){return this.zoom;}};const markerContext={map:zoomProbe,$:()=>stateProbe,stopMarkers:[markerProbe],stopMarkerRadius:null};
vm.runInNewContext(src.slice(src.indexOf('function updateStopMarkerSizes(){'),src.indexOf("if(map)map.on('zoomend',updateStopMarkerSizes);")),markerContext);
markerContext.updateStopMarkerSizes();assert.equal(markerProbe.radius,5,'Overview keeps small stops');stateProbe.dataset.navigating='true';zoomProbe.zoom=16;markerContext.updateStopMarkerSizes();assert.equal(markerProbe.radius,8,'Near GPS view enlarges stops');assert.equal(markerProbe.weight,2.5);zoomProbe.zoom=14;markerContext.updateStopMarkerSizes();assert.equal(markerProbe.radius,5,'Zooming out restores small stops');zoomProbe.zoom=16;stateProbe.dataset.navigating='false';markerContext.updateStopMarkerSizes();assert.equal(markerProbe.radius,5,'Stopping GPS keeps normal markers even when zoomed in');console.log('Correcto: paradas ampliadas solo con navegación GPS y zoom cercano.');

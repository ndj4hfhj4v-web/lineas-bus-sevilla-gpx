const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/app.js','utf8');
const config=app.slice(app.indexOf('const MAP_BACKGROUNDS='),app.indexOf('const map=typeof L'));
const init=app.slice(app.indexOf('function initMapType('),app.lastIndexOf('initMapType(background,initialMapType);'));
const root={dataset:{}},select={value:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},removeEventListener(name){delete this.listeners[name];}},store=new Map(),listeners={};
const context={URL,document:{documentElement:root,getElementById:()=>select},window:{addEventListener(name,fn){listeners[name]=fn;},removeEventListener(name){delete listeners[name];}},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)}};
vm.runInNewContext(config+init,context);
const expected={street:['ign-base','IGNBaseTodo'],aerial:['pnoa-ma','OI.OrthoimageCoverage'],topographic:['mapa-raster','MTN']};
for(const [type,[service,layer]] of Object.entries(expected)){const url=new URL(context.mapTileUrl(type));assert.equal(url.pathname,'/wmts/'+service);assert.equal(url.searchParams.get('LAYER'),layer);assert.equal(url.searchParams.get('TILEMATRIXSET'),'GoogleMapsCompatible');}
assert.equal(context.mapTileUrl('invalid'),context.mapTileUrl('street'));
const urls=[],clean=context.initMapType({setUrl:url=>urls.push(url)},'street');assert.equal(root.dataset.mapType,'street');assert.equal(urls.length,0,'The initial layer must not be downloaded twice');
select.value='aerial';select.listeners.change();assert.equal(root.dataset.mapType,'aerial');assert.equal(store.get('bus-sevilla-map-type'),'aerial');assert.equal(urls.length,1);
select.listeners.change();assert.equal(urls.length,1,'Selecting the same map must not reload tiles');
select.value='topographic';select.listeners.change();assert.equal(root.dataset.mapType,'topographic');assert.equal(urls.length,2);
listeners.storage({key:'bus-sevilla-map-type',newValue:'street'});assert.equal(root.dataset.mapType,'street');clean();
assert.equal(context.readMapType(),'topographic');const persisted=context.initMapType({setUrl:()=>assert.fail('Initial saved type is already used when creating the tile layer')},context.readMapType());assert.equal(select.value,'topographic');persisted();
context.localStorage.getItem=()=>{throw Error('No storage');};context.localStorage.setItem=()=>{throw Error('No storage');};assert.equal(context.readMapType(),'street');const noStorage=context.initMapType(null);select.value='aerial';select.listeners.change();assert.equal(select.value,'aerial');noStorage();
console.log('Correcto: tres fondos oficiales, elección persistente, cambio sin mover el mapa y sin descargas duplicadas.');

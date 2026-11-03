const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=require('../src/core.js'),src=fs.readFileSync('src/app.js','utf8');
const features=core.validFeatures(JSON.parse(fs.readFileSync('src/snapshot.json','utf8'))),index=new Map();
for(const f of features){const id=String(f.attributes.LabelLinea||f.attributes.Linea).padStart(2,'0');if(!index.has(id))index.set(id,{id,items:[]});index.get(id).items.push(f);}
const files=[],links=[],revoked=[],timers=[],elements={downloadStatus:{},gpxFiles:{hidden:true,append(link){links.push(link);},replaceChildren(){links.length=0;}}};let url=0;
const context={...core,Blob,features,groups:[...index.values()],selected:'05',current:index.get('05').items[0],$:id=>elements[id],URL:{createObjectURL:()=>`blob:test-${++url}`,revokeObjectURL:u=>revoked.push(u)},setTimeout:fn=>timers.push(fn),document:{createElement:()=>({click(){files.push({name:this.download,url:this.href});}})}};
vm.runInNewContext(src.slice(src.indexOf('function selectableRoutes('),src.indexOf('function choose('))+src.slice(src.indexOf('let gpxDownloadUrls='),src.indexOf('async function attachStops')),context);
(async()=>{
 for(const group of index.values())for(const route of context.selectableRoutes(group)){
  const pair=context.lineGpxRoutes(group,route);assert.equal(pair.length,2,`Two directions for ${group.id}`);assert(pair.includes(route),'Include the selected direction');assert(pair.every(f=>f.attributes.Sublinea===route.attributes.Sublinea),'Keep both directions of the same variant');
 }
 const generated=[];context.gpx=items=>{assert.equal(items.length,1,'Never combine both tracks');const text=core.gpx(items);generated.push({route:items[0],text});return text;};
 context.downloadLineGpx();assert.equal(files.length,2);assert.notEqual(files[0].name,files[1].name);assert(files.every(f=>f.name.endsWith('.gpx')));assert.equal(links.length,2);assert.equal(elements.gpxFiles.hidden,false);assert.match(elements.downloadStatus.textContent,/2 archivos/);
 for(const {route,text} of generated){assert.equal((text.match(/<trk>/g)||[]).length,1);assert.equal((text.match(/<wpt /g)||[]).length,route.stops.length);}
 assert(links.every((link,i)=>link.download===files[i].name),'Separate links remain available if an automatic download is blocked');
 context.clearGpxDownloads();assert.equal(links.length,0);assert.equal(elements.gpxFiles.hidden,true);timers.forEach(fn=>fn());assert.equal(revoked.length,4,'Release automatic and fallback download URLs');
 console.log('Correcto: dos GPX separados por línea y variante, con sus paradas, nombres diferentes y enlaces individuales.');
})().catch(error=>{console.error(error);process.exitCode=1;});

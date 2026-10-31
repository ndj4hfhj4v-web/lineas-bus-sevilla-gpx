const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../src'),out=path.resolve(__dirname,'../docs');
fs.mkdirSync(out,{recursive:true});let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const data=JSON.parse(fs.readFileSync(path.join(root,'snapshot.json'),'utf8'));require('../src/core.js').validFeatures(data);
for(const name of ['leaflet.css','style.css'])html=html.replace('<link rel="stylesheet" href="'+name+'">',()=>'<style>'+fs.readFileSync(path.join(root,name),'utf8')+'</style>');
for(const name of ['leaflet.js','leaflet-rotate.js','core.js','navigation.js','app.js']){
 let js=fs.readFileSync(path.join(root,name),'utf8');
 if(name==='app.js')js=js.replace("const r=await fetch('snapshot.json');if(!r.ok)throw Error();data=await r.json();",'data=JSON.parse(document.getElementById("embedded-data").textContent);');
 html=html.replace('<script src="'+name+'"></script>',()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');
}
html=html.replace('<script>',()=>'<script type="application/json" id="embedded-data">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script><script>');
fs.writeFileSync(path.join(out,'index.html'),html);
fs.copyFileSync(path.join(root,'manifest.webmanifest'),path.join(out,'manifest.webmanifest'));
fs.cpSync(path.join(root,'icons'),path.join(out,'icons'),{recursive:true});fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log('Web generada en docs/.');

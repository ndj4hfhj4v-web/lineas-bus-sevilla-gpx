const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/app.js','utf8');
const source=app.slice(app.indexOf('function initMapViewport(map){'),app.lastIndexOf('initMapViewport(map);'));
function target(values={}){return {...values,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},removeEventListener(name){delete this.listeners[name];}};}
function check(withVisualViewport){
 const vv=target({width:390,height:844,offsetTop:0,offsetLeft:0}),win=target({innerWidth:390,innerHeight:844,visualViewport:withVisualViewport?vv:undefined});
 const props={},frames=new Map(),invalidations=[];let next=0;
 const context={window:win,document:{documentElement:{style:{setProperty(name,value){props[name]=value;}}}},requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);}};
 vm.runInNewContext(source,context);const clean=context.initMapViewport({invalidateSize(options){invalidations.push(options);}});
 const flush=()=>{for(const [id,fn] of frames){frames.delete(id);fn();}};
 assert.equal(props['--app-height'],'844px');assert.equal(props['--app-width'],'390px');
 if(withVisualViewport){
  // Safari moves the visible area while focusing a search field or showing browser bars.
  Object.assign(vv,{height:470,offsetTop:160});vv.listeners.resize();vv.listeners.scroll();assert.equal(frames.size,1);flush();
  assert.equal(props['--app-height'],'470px');assert.equal(props['--app-top'],'160px');
  Object.assign(vv,{width:844,height:390,offsetTop:0,offsetLeft:0});win.listeners.orientationchange();flush();
  assert.equal(props['--app-width'],'844px');assert.equal(props['--app-top'],'0px');
  const count=invalidations.length;vv.offsetTop=24;vv.listeners.scroll();flush();assert.equal(invalidations.length,count,'A viewport offset must not pan the map');
 }else{win.innerHeight=480;win.listeners.resize();flush();assert.equal(props['--app-height'],'480px');}
 for(const options of invalidations){assert.equal(options.pan,false);assert.equal(options.animate,false);}
 win.listeners.pageshow();flush();clean();assert.equal(Object.keys(win.listeners).length,0);assert.equal(Object.keys(vv.listeners).length,0);
}
check(true);check(false);console.log('Correcto: encuadre visible, teclado, barras del navegador, giro y recuperación de página sin desplazar el mapa.');

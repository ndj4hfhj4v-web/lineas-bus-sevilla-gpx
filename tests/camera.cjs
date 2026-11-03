const assert=require('node:assert/strict');
const {createGpsCamera,gpsLookAheadCenter}=require('../src/navigation.js');
let next=0,clock=0;const frames=new Map();
global.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};
global.cancelAnimationFrame=id=>frames.delete(id);
function advance(ms){clock+=ms;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(clock));}
const map={zoom:16,bearing:1,draws:0,animated:0,getZoom(){return this.zoom;},getBearing(){return this.bearing;},setBearing(b){this.bearing=b;},stopHeadingUp(){},setView(p,z,options){this.point=p;this.zoom=z;if(options.animate)this.animated++;},panTo(p,options){this.point=p;this.draws++;if(options.animate)this.animated++;}};
const camera=createGpsCamera(map);
camera.follow({lat:37.39,lon:-5.99},359);
camera.follow({lat:37.3901,lon:-5.99},1);advance(0);advance(325);
assert(map.point[0]>37.39&&map.point[0]<37.3901,'Position interpolates instead of jumping');
assert(map.bearing<2||map.bearing>358,'Cross north using the short turn');
advance(325);assert.equal(map.point[0],37.3901);assert.equal(map.bearing,359);assert.equal(frames.size,0);
map.zoom=14;camera.follow({lat:37.3902,lon:-5.99},10);advance(0);advance(200);
const paused=[...map.point];camera.cancel();advance(1000);assert.deepEqual(map.point,paused,'Dragging cancels pending camera motion');
camera.follow({lat:37.3903,lon:-5.99},20);advance(0);advance(650);assert.equal(map.zoom,14,'GPS preserves manual zoom');
camera.follow({lat:37.3904,lon:-5.99},30);advance(0);advance(100);camera.follow({lat:37.3905,lon:-5.99},40);assert.equal(frames.size,1,'Only one camera animation may run');advance(0);advance(650);assert.equal(map.point[0],37.3905);
camera.follow({lat:37.3906,lon:-5.99},50);advance(0);advance(60000);assert.equal(frames.size,0,'Returning from background completes the current target');
camera.follow({lat:37.45,lon:-5.99},90);assert.equal(frames.size,0,'Signal recovery far away does not animate across the city');assert.equal(map.point[0],37.45);
camera.follow({lat:37.4501,lon:-5.99},90);camera.reset();advance(1000);assert.equal(frames.size,0,'Stopping removes pending frames');assert.equal(map.animated,0,'No CSS pan competes with rotation');
delete global.requestAnimationFrame;delete global.cancelAnimationFrame;
console.log('Correcto: cámara coordinada, giro corto, zoom manual, cancelación, recuperación y ausencia de animaciones en conflicto.');

// Check the actual screen offset for rotated maps, zoom changes and both orientations.
for(const [width,height] of [[390,844],[844,390]])for(const zoom of [12,16,19])for(const bearing of [0,45,90,180,270,359]){
 const scale=2**zoom,project=([lat,lon])=>({x:lon*scale,y:-lat*scale}),geo={getSize:()=>({x:width,y:height}),project,unproject:p=>({lat:-p.y/scale,lng:p.x/scale})};
 const fix={lat:37.39,lon:-5.99},center=gpsLookAheadCenter(geo,fix,bearing,zoom),p=project([fix.lat,fix.lon]),c=project(center),angle=bearing*Math.PI/180,dx=p.x-c.x,dy=p.y-c.y;
 const x=width/2+dx*Math.cos(angle)-dy*Math.sin(angle),y=height/2+dx*Math.sin(angle)+dy*Math.cos(angle);
 assert(Math.abs(x-width/2)<.00001,'Vehicle remains horizontally centered');assert(Math.abs(y-height*.7)<.00001,'Vehicle remains 70% down the map throughout a turn');
}
console.log('Correcto: más espacio por delante en todos los rumbos, zooms y orientaciones de pantalla.');

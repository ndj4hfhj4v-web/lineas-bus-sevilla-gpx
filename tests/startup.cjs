const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/startup.js','utf8');
const css=fs.readFileSync('src/style.css','utf8'),splashZ=Number(css.match(/\.app-splash\{[^}]*z-index:(\d+)/)[1]),expandedZ=Number(css.match(/#gpsDetail\[data-expanded="true"\]\{[^}]*z-index:(\d+)/)[1]);assert(splashZ>expandedZ,'The startup logo must stay above the GPS map even when navigation expands on boot');
function setup(inline=false){let clock=0;const frames=[],timers=new Map(),events={},docEvents={};let next=0;
 const splash={hidden:false,querySelector:()=>inline?null:({decode:()=>Promise.resolve()})},doc={visibilityState:'visible',getElementById:()=>splash,addEventListener:(k,f)=>docEvents[k]=f},win={matchMedia:()=>({matches:true}),requestAnimationFrame:f=>frames.push(f),setTimeout:(f,delay)=>{const id=++next;timers.set(id,{f,at:clock+delay});return id;},clearTimeout:id=>timers.delete(id),addEventListener:(k,f)=>events[k]=f};
 vm.runInNewContext(source,{window:win,document:doc,navigator:{},Date:{now:()=>clock}});
 return {splash,doc,events,docEvents,frames,timers,frame(){const pending=frames.splice(0);pending.forEach(f=>f());},advance(ms){clock+=ms;for(const [id,t] of timers)if(t.at<=clock){timers.delete(id);t.f();}}};
}
(async()=>{
 const direct=setup(true);for(let tick=0;tick<4;tick++)await Promise.resolve();direct.frame();direct.frame();direct.advance(499);assert.equal(direct.splash.hidden,false,'Inline SVG must remain visible');direct.advance(1);assert.equal(direct.splash.hidden,true);
 const a=setup();for(let tick=0;tick<4;tick++)await Promise.resolve();a.advance(2000);assert.equal(a.splash.hidden,false,'Slow startup must not consume the logo hold');assert.equal(a.timers.size,0);a.frame();assert.equal(a.timers.size,0,'Wait for a paint opportunity');a.frame();a.advance(499);assert.equal(a.splash.hidden,false);a.advance(1);assert.equal(a.splash.hidden,true,'Hide exactly 500 ms after paint');
 a.doc.visibilityState='hidden';a.docEvents.visibilitychange();a.advance(2000);a.doc.visibilityState='visible';a.docEvents.visibilitychange();assert.equal(a.splash.hidden,false,'Reopening the installed app replays the logo');for(let tick=0;tick<4;tick++)await Promise.resolve();a.frame();a.frame();a.advance(500);assert.equal(a.splash.hidden,true);
 a.events.pageshow({persisted:true});assert.equal(a.splash.hidden,false,'Restoring a suspended page shows the logo');for(let tick=0;tick<4;tick++)await Promise.resolve();a.doc.visibilityState='hidden';a.docEvents.visibilitychange();a.frame();a.frame();a.advance(1000);assert.equal(a.splash.hidden,false,'Never count time while the app is hidden');
 console.log('Correcto: medio segundo después del pintado, carga lenta, reapertura y recuperación desde segundo plano.');
})().catch(e=>{console.error(e);process.exitCode=1;});

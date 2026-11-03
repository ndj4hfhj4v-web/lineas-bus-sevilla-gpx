/* Start the half-second hold after the embedded logo can actually be painted. */
function initStartup(win=window,doc=document,nav=navigator){
 const splash=doc.getElementById('appSplash');if(!splash)return;
 const image=splash.querySelector('img');let token=0,timer=null,hiddenAt=null;
 const installed=()=>!!(nav.standalone||win.matchMedia?.('(display-mode: standalone)').matches);
 function show(){
  const current=++token;win.clearTimeout(timer);splash.hidden=false;
  const ready=image?.decode?image.decode().catch(()=>{}):Promise.resolve();
  ready.then(()=>{if(current!==token||doc.visibilityState==='hidden')return;
   win.requestAnimationFrame(()=>win.requestAnimationFrame(()=>{if(current!==token||doc.visibilityState==='hidden')return;timer=win.setTimeout(()=>{if(current===token)splash.hidden=true;},500);}));
  });
 }
 function visibility(){if(doc.visibilityState==='hidden'){hiddenAt=Date.now();++token;win.clearTimeout(timer);}else{const resume=hiddenAt!==null&&Date.now()-hiddenAt>=1000;hiddenAt=null;if(!splash.hidden||(installed()&&resume))show();}}
 win.addEventListener('pageshow',event=>{if(event.persisted)show();});doc.addEventListener('visibilitychange',visibility);show();
}
initStartup();

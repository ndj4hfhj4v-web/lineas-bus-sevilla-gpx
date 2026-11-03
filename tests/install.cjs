const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/app.js','utf8');
const source=app.slice(app.indexOf('function initInstallation('),app.lastIndexOf('initInstallation();'));
function target(extra={}){return {...extra,listeners:{},addEventListener(k,f){this.listeners[k]=f;},removeEventListener(k){delete this.listeners[k];}};}
function setup(userAgent,standalone=false,touch=0){const elements=Object.fromEntries(['installAction','installStatus','installSteps','installMenuLabel'].map(id=>[id,{}])),mode=target({matches:standalone}),win=target({matchMedia:()=>mode}),nav={userAgent,maxTouchPoints:touch},doc={getElementById:id=>elements[id]},context={};vm.runInNewContext(source,context);return {...elements,mode,win,nav,controller:context.initInstallation(win,nav,doc)};}
(async()=>{
 const iphone=setup('iPhone');assert.match(iphone.installSteps.textContent,/Safari/);assert.match(iphone.installSteps.textContent,/Añadir a pantalla de inicio/);assert(iphone.installAction.hidden);
 const ipad=setup('Macintosh',false,5);assert.match(ipad.installSteps.textContent,/Safari/);
 const android=setup('Android');assert.match(android.installSteps.textContent,/Chrome/);let prevented=false,prompts=0;
 android.win.listeners.beforeinstallprompt({preventDefault(){prevented=true;},async prompt(){prompts++;},userChoice:Promise.resolve({outcome:'dismissed'})});assert(prevented);assert.equal(prompts,0,'No unsolicited install popup');assert.equal(android.installAction.hidden,false);await android.installAction.onclick();assert.equal(prompts,1);assert(android.installAction.hidden);await android.installAction.onclick();assert.equal(prompts,1,'A consumed prompt cannot be reused');
 android.win.listeners.beforeinstallprompt({preventDefault(){},async prompt(){},userChoice:Promise.resolve({outcome:'accepted'})});await android.installAction.onclick();assert.match(android.installStatus.textContent,/solicitada/);assert(android.installAction.hidden);
 android.mode.matches=true;android.mode.listeners.change();assert.match(android.installMenuLabel.textContent,/instalada/);assert.match(android.installSteps.textContent,/sin conexión/);android.controller.destroy();assert.equal(Object.keys(android.win.listeners).length,0);
 const desktop=setup('Windows');assert.match(desktop.installSteps.textContent,/Edge/);desktop.win.listeners.beforeinstallprompt({preventDefault(){},async prompt(){throw Error('Unavailable');}});await desktop.installAction.onclick();assert.equal(desktop.installAction.disabled,false);assert.match(desktop.installSteps.textContent,/menú/);
 const iosStandalone=setup('iPhone');iosStandalone.nav.standalone=true;iosStandalone.controller.refresh();assert.match(iosStandalone.installStatus.textContent,/desde su icono/);assert(iosStandalone.installAction.hidden);
 console.log('Correcto: instrucciones iPhone/iPad, instalación Android, cancelación, errores y detección de app instalada.');
})().catch(e=>{console.error(e);process.exitCode=1;});

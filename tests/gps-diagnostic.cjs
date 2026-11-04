const assert=require('node:assert/strict'),{runGpsDiagnostic,gpsDiagnosticText}=require('../src/navigation.js');
module.exports=(async()=>{
 let serial=0;const pending=new Map();function environment(getCurrentPosition,extra={}){return {window:{isSecureContext:true},navigator:{geolocation:{getCurrentPosition},permissions:{query:()=>({then:resolve=>resolve({state:'granted'})})}},now:()=>100000,setTimeout(fn){const id=++serial;pending.set(id,fn);queueMicrotask(()=>{if(pending.has(id))fn();});return id;},clearTimeout:id=>pending.delete(id),...extra};}
 const options=[];const result=await runGpsDiagnostic(environment((ok,error,settings)=>{options.push(settings);ok({coords:{latitude:37.1234567,longitude:-5.1234567,accuracy:12},timestamp:99000});}));
 assert.equal(result.permission,'granted');assert.equal(result.tests.length,2);assert.equal(result.tests[0].status,'received');assert.equal(result.tests[0].age,1);assert.equal(options[0].enableHighAccuracy,false);assert.equal(options[1].enableHighAccuracy,true);assert.equal(options[0].maximumAge,30000);assert.equal(options[1].maximumAge,0);assert.equal(options[1].timeout,45000);assert(!JSON.stringify(result).includes('37.1234567'),'Never retain coordinates in diagnostics');assert(!gpsDiagnosticText(result).includes('-5.1234567'));
 const timeout=await runGpsDiagnostic(environment((ok,error)=>error({code:3,message:'Timeout expired'})));assert.equal(timeout.tests[0].code,3);assert.match(gpsDiagnosticText(timeout),/código 3/);
 let calls=0;const denied=await runGpsDiagnostic(environment((ok,error)=>{calls++;error({code:1,message:'Denied'});}));assert.equal(calls,1,'Do not repeatedly request a denied permission');assert.match(gpsDiagnosticText(denied),/permiso denegado/);
 const missing=await runGpsDiagnostic(environment(()=>{}));assert.equal(missing.tests[0].status,'no-callback');assert.equal(missing.tests[1].status,'no-callback');
 const invalid=await runGpsDiagnostic(environment(ok=>ok({coords:{latitude:NaN,longitude:0,accuracy:1},timestamp:100000})));assert.equal(invalid.tests[0].status,'invalid');
 const exception=await runGpsDiagnostic(environment(()=>{throw Error('Sensor unavailable');}));assert.equal(exception.tests[0].status,'exception');
 const unsupported=await runGpsDiagnostic(environment(()=>{}, {navigator:{}}));assert.equal(unsupported.available,false);assert.equal(unsupported.tests.length,0);assert.equal(pending.size,0,'Clear all diagnostic timers');
 console.log('Correcto: diagnóstico GPS directo, precisión aproximada y alta, permisos, errores, ausencia de respuesta y privacidad.');
})();

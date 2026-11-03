import{Capacitor,registerPlugin}from"@capacitor/core";
import type{PluginListenerHandle}from"@capacitor/core";
import type{DriverStateProjection}from"../../../packages/core/src/commands";
import type{GpsFix}from"../../../packages/core/src/types";
import type{DriverEvent,DriverIntent}from"../../../packages/domain/src/driver-workflow";
import type{DriverWorkflowRepository,EventLocationProvider}from"../../../packages/application/src/driver-workflow-service";
import{DexieDriverWorkflowRepository}from"../../../packages/storage-browser/src/driver-workflow";

type NativeApi={
 getSnapshot():Promise<{snapshot:DriverStateProjection}>;
 queueIntent(o:{command:DriverIntent["command"]}):Promise<{intent:DriverIntent}>;
 listPending():Promise<{intents:DriverIntent[]}>;\n listEvents():Promise<{events:DriverEvent[]}>;\n retryIntent(o:{eventId:string}):Promise<{intent:DriverIntent}>;
 captureLocation():Promise<GpsFix>;
 completeIntent(o:{eventId:string;gps:GpsFix}):Promise<{snapshot:DriverStateProjection}>;
 markNeedsAttention(o:{eventId:string;reason:string}):Promise<void>;
 addListener(event:"driverStateChanged",listener:(data:{snapshot:DriverStateProjection})=>void):Promise<PluginListenerHandle>;
};
const NativeDriver=registerPlugin<NativeApi>("DriverWorkflow");
export class NativeDriverWorkflowRepository implements DriverWorkflowRepository{
 private listeners=new Set<(s:DriverStateProjection)=>void>();private handle?:PluginListenerHandle;
 constructor(){void NativeDriver.addListener("driverStateChanged",data=>this.listeners.forEach(fn=>fn(data.snapshot))).then(h=>this.handle=h)}
 async getSnapshot(){return(await NativeDriver.getSnapshot()).snapshot}
 async queueIntent(intent:DriverIntent){return(await NativeDriver.queueIntent({command:intent.command})).intent}
 async reactivateIntent(eventId:string){return(await NativeDriver.retryIntent({eventId})).intent}\n async getIntent(eventId:string){return(await NativeDriver.listPending()).intents.find(i=>i.command.eventId===eventId)}
 async listPending(){return(await NativeDriver.listPending()).intents}
 async completeIntent(eventId:string,gps:GpsFix){return(await NativeDriver.completeIntent({eventId,gps})).snapshot}
 markNeedsAttention(eventId:string,reason:string){return NativeDriver.markNeedsAttention({eventId,reason})}
 async listEvents():Promise<DriverEvent[]>{return(await NativeDriver.listEvents()).events}
 subscribe(fn:(s:DriverStateProjection)=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
 dispose(){void this.handle?.remove();this.listeners.clear()}
}
export class BrowserEventLocationProvider implements EventLocationProvider{
 capture():Promise<GpsFix>{return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(new Error("location_unavailable"));return}
  navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,horizontalAccuracyM:p.coords.accuracy,fixAt:new Date(p.timestamp).toISOString(),provider:"browser-geolocation"}),e=>reject(new Error(e.code===1?"permission_denied":e.code===3?"location_timeout":"location_unavailable")),{enableHighAccuracy:true,maximumAge:0,timeout:35000});
 })}
}
export class NativeEventLocationProvider implements EventLocationProvider{capture(){return NativeDriver.captureLocation()}}
export async function createDriverWorkflow():Promise<{repository:DriverWorkflowRepository;location:EventLocationProvider}>{
 if(Capacitor.isNativePlatform())return{repository:new NativeDriverWorkflowRepository(),location:new NativeEventLocationProvider()};
 return{repository:new DexieDriverWorkflowRepository(),location:new BrowserEventLocationProvider()};
}

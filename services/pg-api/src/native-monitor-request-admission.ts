import {HttpError} from './contracts.ts'
type Entry={start:number;count:number;active:number}
const windowMs=10000,maxKeys=2048,ownerBurst=40,ipBurst=120,ownerActive=6,ipActive=12,globalActive=64
/** Process-local pilot admission. HTTP metadata never supplies a permit or quota. */
export class NativeMonitorRequestAdmission{
 private readonly owners=new Map<string,Entry>()
 private readonly ips=new Map<string,Entry>()
 private active=0
 private stamp=0
 private readonly clock:()=>number
 constructor(clock:()=>number=Date.now){this.clock=clock}
 private now(){const value=this.clock();if(!Number.isFinite(value)||value<0)throw new HttpError(503,'monitor_admission_unavailable');this.stamp=Math.max(this.stamp,value);return this.stamp}
 private enter(map:Map<string,Entry>,key:string,burst:number,parallel:number,global:boolean){
  const now=this.now()
  for(const [id,row]of map)if(row.active===0&&now-row.start>=windowMs)map.delete(id)
  let entry=map.get(key)
  if(!entry){if(map.size>=maxKeys)throw new HttpError(429,'monitor_request_rate_limited');entry={start:now,count:0,active:0};map.set(key,entry)}
  if(now-entry.start>=windowMs){entry.start=now;entry.count=0}
  if(entry.count>=burst||entry.active>=parallel||global&&this.active>=globalActive)throw new HttpError(429,'monitor_request_rate_limited')
  entry.count++;entry.active++;if(global)this.active++
  let released=false
  return()=>{if(released)return;released=true;entry!.active--;if(global)this.active--}
 }
 admitIp(address:unknown){const key=typeof address==='string'&&address.length>0&&address.length<=128?address:'unavailable';return this.enter(this.ips,key,ipBurst,ipActive,true)}
 admitOwner(identity:{issuer:string;subject:string}){
  if(identity.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||identity.subject.length<1||identity.subject.length>512)throw new HttpError(403,'native_employee_identity_required')
  return this.enter(this.owners,identity.subject,ownerBurst,ownerActive,false)
 }
}

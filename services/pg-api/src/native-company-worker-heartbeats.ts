// Unmounted Native composition only. No HTTP route, telemetry credentials,
// arbitrary target/clock/client adapters, Worker ready flag or automatic retry.
// Native and controller are independent boundaries, NOT one atomic DB check.
import {performance} from 'node:perf_hooks'
import {setTimeout,clearTimeout} from 'node:timers'
import type {SqlPool} from './contracts.ts'
import {NativeCurrentCompanyAdmin,NativeCompanyAdminError} from './native-current-company-admin.mjs'
import {beginWorkerHeartbeatNativeReadBudget,connectWorkerHeartbeatReadControl,prepareWorkerHeartbeatSnapshot,
  finishWorkerHeartbeatSnapshot,consumeWorkerHeartbeatSnapshot,
  cancelWorkerHeartbeatSnapshot,closeWorkerHeartbeatReadControl,
  type ReaderClient,type PendingRead} from './worker-heartbeat-activation-control-client.ts'
import {parseWorkerHeartbeatSnapshot,type WorkerHeartbeatSnapshot} from './worker-heartbeat-contract.ts'

export class NativeCompanyWorkerHeartbeatsError extends Error {
  readonly status=503
  readonly code='company_worker_heartbeats_unavailable'
  constructor(){super('company_worker_heartbeats_unavailable');this.name='NativeCompanyWorkerHeartbeatsError'}
}
export type NativeCompanyWorkerHeartbeatsLocalStatus=Readonly<{
  /** Reservations include timed-out work and unconfirmed cleanup. NOT drain. */
  inFlight:0|1|2
  timedOut:0|1|2
  cleanupUnknown:0|1|2
}>
type Phase='authorizing'|'before_read'|'connecting'|'preparing'|'auth_post'|'finishing'|'consuming'|'cleanup'|'ended'
type Request={
  deadline:number
  phase:Phase
  timer:ReturnType<typeof setTimeout>|undefined
  retired:boolean
  timedOut:boolean
  replied:boolean
  ipcPending:boolean
  finishStarted:boolean
  client:ReaderClient|undefined
  pending:PendingRead|undefined
  cleanup:Promise<boolean>|undefined
  cleanupUnknown:boolean
  resolve:(snapshot:WorkerHeartbeatSnapshot)=>void
  reject:(error:Error)=>void
}
const now=performance.now.bind(performance),budgetMs=8000
const unavailable=()=>new NativeCompanyWorkerHeartbeatsError()

export class NativeCompanyWorkerHeartbeats {
  readonly #admin:NativeCurrentCompanyAdmin
  readonly #requests=new Set<Request>()
  /** Trusted restricted Native auth pool only. This creates ONE actual H3
   * instance per service component, never one per request or a public adapter. */
  constructor(authPool:SqlPool){this.#admin=new NativeCurrentCompanyAdmin(authPool)}
  localStatus():NativeCompanyWorkerHeartbeatsLocalStatus{
    return Object.freeze({inFlight:this.#requests.size as 0|1|2,
      timedOut:[...this.#requests].filter(r=>r.timedOut).length as 0|1|2,
      cleanupUnknown:[...this.#requests].filter(r=>r.cleanupUnknown).length as 0|1|2})
  }
  read(cookie:string):Promise<WorkerHeartbeatSnapshot>{
    // Reserve synchronously. A503 response/deadline never frees active work.
    if(this.#requests.size>=2)return Promise.reject(unavailable())
    let resolve!:(snapshot:WorkerHeartbeatSnapshot)=>void,reject!:(error:Error)=>void
    const response=new Promise<WorkerHeartbeatSnapshot>((yes,no)=>{resolve=yes;reject=no})
    const request:Request={deadline:now()+budgetMs,phase:'authorizing',timer:undefined,
      retired:false,timedOut:false,replied:false,ipcPending:false,finishStarted:false,
      client:undefined,pending:undefined,cleanup:undefined,cleanupUnknown:false,resolve,reject}
    this.#requests.add(request)
    request.timer=setTimeout(()=>this.#expire(request),budgetMs)
    // Keep the owned work alive and observed after the caller has timed out.
    // No Promise.race, fresh context, reconnection or automatic retry follows.
    void this.#run(request,cookie).catch(()=>{
      request.cleanupUnknown=true;this.#retire(request,unavailable())
    })
    return response
  }
  #clearTimer(request:Request):void{
    if(request.timer!==undefined){clearTimeout(request.timer);request.timer=undefined}
  }
  #retire(request:Request,error:Error):void{
    request.retired=true;this.#clearTimer(request)
    if(!request.replied){request.replied=true;request.reject(error)}
    // During Native post (no pending IPC), a known pending controller read can
    // already be cancelled. With connect/prepare/finish still outstanding the
    // fixed ABI offers no abort handle: retain it and clean its late result.
    if(request.client&&!request.ipcPending)void this.#beginCleanup(request)
  }
  #expire(request:Request):void{
    if(request.replied)return
    const remaining=request.deadline-now()
    if(remaining>0){this.#clearTimer(request);request.timer=setTimeout(()=>this.#expire(request),Math.max(1,Math.ceil(remaining)));return}
    request.timedOut=true;this.#retire(request,unavailable())
  }
  #current(request:Request):void{
    if(now()>=request.deadline)this.#expire(request)
    if(request.retired)throw unavailable()
  }
  #failure(request:Request,error:unknown):Error{
    // Only errors coming directly from the actual Native guard can preserve
    // its fixed401/403 semantics. Controller/error-shaped JSON never can.
    try{
      if(['authorizing','before_read','auth_post'].includes(request.phase)&&error instanceof NativeCompanyAdminError){
        const status=Object.getOwnPropertyDescriptor(error,'status')?.value,
          code=Object.getOwnPropertyDescriptor(error,'code')?.value
        if(status===401&&code==='session_required')return new NativeCompanyAdminError(401,'session_required')
        if(status===403&&code==='admin_required')return new NativeCompanyAdminError(403,'admin_required')
      }
    }catch{ /* No arbitrary error descriptor or diagnostic crosses Native. */ }
    return unavailable()
  }
  #beginCleanup(request:Request):Promise<boolean>{
    if(request.cleanup)return request.cleanup
    if(!request.client)return Promise.resolve(true)
    if(request.ipcPending){request.cleanupUnknown=true;return Promise.resolve(false)}
    let done!:(confirmed:boolean)=>void
    const cleanup=new Promise<boolean>(resolve=>{done=resolve})
    // Latch before calling fixed client functions, including synchronous reentry.
    request.cleanup=cleanup
    const client=request.client
    void this.#dispose(request,client).then(done,()=>{request.cleanupUnknown=true;done(false)})
    return cleanup
  }
  async #dispose(request:Request,client:ReaderClient):Promise<boolean>{
    let confirmed=true
    // Once finish has been invoked its pending handle is one-shot consumed by
    // that ABI. Close invalidates late completed handles; never consume them.
    if(request.pending&&!request.finishStarted){
      try{await cancelWorkerHeartbeatSnapshot(client,request.pending)}catch{confirmed=false}
    }
    try{await closeWorkerHeartbeatReadControl(client)}catch{confirmed=false}
    request.cleanupUnknown=!confirmed
    return confirmed
  }
  async #run(request:Request,cookie:string):Promise<void>{
    try{
      this.#current(request)
      // Inert private handle only: its client deadline includes Native auth.
      // No socket is connected until the original context has passed pre-read.
      const budget=beginWorkerHeartbeatNativeReadBudget()
      const context=await this.#admin.authorize(cookie)
      this.#current(request)
      request.phase='before_read';this.#admin.assertBeforeRead(cookie,context)
      this.#current(request)
      request.phase='connecting';request.ipcPending=true
      try{request.client=await connectWorkerHeartbeatReadControl(budget)}finally{request.ipcPending=false}
      this.#current(request)
      request.phase='preparing';request.ipcPending=true
      try{request.pending=await prepareWorkerHeartbeatSnapshot(request.client)}finally{request.ipcPending=false}
      this.#current(request)
      request.phase='auth_post'
      await this.#admin.confirmAfterRead(cookie,context)
      this.#current(request)
      request.phase='finishing';request.finishStarted=true;request.ipcPending=true
      let completed
      try{completed=await finishWorkerHeartbeatSnapshot(request.client,request.pending)}finally{request.ipcPending=false}
      this.#current(request)
      request.phase='consuming'
      // No await between the actual finish handle and its one-time consume.
      // The original parser checks ONLY the8-row value contract, not authority;
      // every opaque reference came from this request's fixed controlled client.
      const snapshot=parseWorkerHeartbeatSnapshot(consumeWorkerHeartbeatSnapshot(request.client,completed))
      this.#current(request)
      // Publish in this same synchronous segment, before any cleanup call or
      // await can move the verified snapshot past its publication boundary.
      // Resolution is NOT cleanup: this reservation stays owned in finally.
      request.replied=true;this.#clearTimer(request);request.resolve(snapshot)
    }catch(error){
      if(now()>=request.deadline)request.timedOut=true
      this.#retire(request,request.timedOut?unavailable():this.#failure(request,error))
    }finally{
      request.phase='cleanup'
      const confirmed=await this.#beginCleanup(request)
      request.phase='ended';this.#clearTimer(request)
      if(confirmed)this.#requests.delete(request)
      else request.cleanupUnknown=true // No retry or invented cleanup proof.
      if(!request.replied){
        if(now()>=request.deadline)request.timedOut=true
        this.#retire(request,unavailable())
      }
    }
  }
}

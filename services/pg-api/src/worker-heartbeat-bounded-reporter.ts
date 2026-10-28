// Unmounted local scheduler. No constructor/startup checks, registration, HTTP,
// database, Worker hooks or process signal handlers. A send adapter completion
// proves only its promised I/O lifetime ended, never authority/currentness or
// actual Worker readiness. Abort requests are not cancellation/drain evidence.
import {performance} from 'node:perf_hooks'
import {setTimeout,clearTimeout} from 'node:timers'
import {createWorkerHeartbeatReportSequence,WorkerHeartbeatReportSequenceError,
  type WorkerHeartbeatReport} from './worker-heartbeat-report-sequence.ts'

export type WorkerHeartbeatSendOptions = Readonly<{
  signal: AbortSignal
  timeoutMs: number
  /** Same-process monotonic deadline, NOT a wall-clock expiry or server proof. */
  deadlineMonotonicMs: number
}>
/** Return a native Promise covering the whole I/O lifetime, including cleanup.
 * An adapter that starts detached work cannot be made safe by this scheduler. */
export type WorkerHeartbeatReportSender =
  (report: WorkerHeartbeatReport, options: WorkerHeartbeatSendOptions) => Promise<void>
export type WorkerHeartbeatBoundedReporterOptions = Readonly<{
  generation: string
  /** Delay AFTER observed settlement; there is no catch-up tick queue. */
  intervalMs: number
  sendDeadlineMs: number
  send: WorkerHeartbeatReportSender
}>
type Completion = 'resolved' | 'rejected' | 'threw'
export type WorkerHeartbeatBoundedReporterSnapshot = Readonly<{
  lifecycle: 'stopped' | 'running' | 'closed'
  closeReason: null | 'caller_closed' | 'sequence_exhausted' | 'sequence_failure'
  /** Only this instance's observed adapter invocation, never global drain. */
  io: 'settled' | 'inflight'
  attempts: number
  inFlight: null | Readonly<{
    sequence: number
    completion: 'pending' | 'unobservable'
    deadlineExpired: boolean
    abortRequested: boolean
  }>
  lastSettled: null | Readonly<{
    sequence: number
    result: Completion
    deadlineExpired: boolean
    abortRequested: boolean
  }>
  nextTimerScheduled: boolean
  deadlineTimerScheduled: boolean
}>
export type WorkerHeartbeatBoundedReporter = Readonly<{
  start(): WorkerHeartbeatBoundedReporterSnapshot
  /** Same closed events as the original sequence; caller attestations only. */
  transition(event: unknown): void
  snapshot(): WorkerHeartbeatBoundedReporterSnapshot
  /** Synchronous local close. Inflight stays inflight until actually observed. */
  close(): WorkerHeartbeatBoundedReporterSnapshot
}>
type ErrorCode = 'invalid_worker_heartbeat_bounded_reporter_input' | 'worker_heartbeat_bounded_reporter_closed'
export class WorkerHeartbeatBoundedReporterError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode) {super(code); this.name='WorkerHeartbeatBoundedReporterError'; this.code=code}
}
const invalid=(): never=>{throw new WorkerHeartbeatBoundedReporterError('invalid_worker_heartbeat_bounded_reporter_input')}
const monotonicNow=performance.now.bind(performance)
const observePromise=Promise.prototype.then
const NativeAbortController=AbortController
const maximumTimerMs=2147483647
type Timer=ReturnType<typeof setTimeout>
type Attempt={
  report: WorkerHeartbeatReport
  controller: AbortController
  deadline: number
  deadlineExpired: boolean
  abortRequested: boolean
  completion: 'pending' | 'unobservable'
  timer: Timer | undefined
}
function options(raw: unknown): WorkerHeartbeatBoundedReporterOptions {
  try {
    if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
    const keys=['generation','intervalMs','sendDeadlineMs','send'],own=Reflect.ownKeys(raw),descriptors=Object.getOwnPropertyDescriptors(raw)
    if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key))||
      keys.some(key=>!descriptors[key]?.enumerable||!Object.hasOwn(descriptors[key]!,'value')))return invalid()
    const generation: unknown=descriptors.generation!.value,intervalMs: unknown=descriptors.intervalMs!.value,
      sendDeadlineMs: unknown=descriptors.sendDeadlineMs!.value,send: unknown=descriptors.send!.value
    for(const duration of [intervalMs,sendDeadlineMs])if(typeof duration!=='number'||!Number.isSafeInteger(duration)||duration<1||duration>maximumTimerMs)return invalid()
    if(typeof generation!=='string'||typeof send!=='function')return invalid()
    return {generation,intervalMs:intervalMs as number,sendDeadlineMs:sendDeadlineMs as number,send:send as WorkerHeartbeatReportSender}
  } catch {return invalid()}
}

export function createWorkerHeartbeatBoundedReporter(raw: unknown): WorkerHeartbeatBoundedReporter {
  const selected=Object.freeze(options(raw)),send=selected.send
  let sequence: ReturnType<typeof createWorkerHeartbeatReportSequence>
  try {sequence=createWorkerHeartbeatReportSequence({generation:selected.generation})} catch {return invalid()}
  let lifecycle: WorkerHeartbeatBoundedReporterSnapshot['lifecycle']='stopped'
  let closeReason: WorkerHeartbeatBoundedReporterSnapshot['closeReason']=null
  let active: Attempt | undefined,nextTimer: Timer | undefined,attempts=0
  let lastSettled: WorkerHeartbeatBoundedReporterSnapshot['lastSettled']=null
  function snapshot(): WorkerHeartbeatBoundedReporterSnapshot {
    const current=active
    return Object.freeze({lifecycle,closeReason,io:current?'inflight':'settled',attempts,
      inFlight:current?Object.freeze({sequence:current.report.sequence,completion:current.completion,
        deadlineExpired:current.deadlineExpired||monotonicNow()>=current.deadline,abortRequested:current.abortRequested}):null,
      lastSettled,nextTimerScheduled:nextTimer!==undefined,deadlineTimerScheduled:current?.timer!==undefined})
  }
  function clearDeadline(current: Attempt): void {
    if(current.timer!==undefined){clearTimeout(current.timer);current.timer=undefined}
  }
  function abort(current: Attempt,reason: 'worker_heartbeat_send_deadline' | 'worker_heartbeat_reporter_closed'): void {
    if(current.abortRequested)return
    current.abortRequested=true
    // The slot is deliberately retained even if the adapter ignores the signal.
    try {current.controller.abort(reason)} catch { /* No cancellation proof. */ }
  }
  function closeWith(reason: NonNullable<WorkerHeartbeatBoundedReporterSnapshot['closeReason']>): void {
    if(lifecycle==='closed')return
    lifecycle='closed';closeReason=reason
    if(nextTimer!==undefined){clearTimeout(nextTimer);nextTimer=undefined}
    if(active){clearDeadline(active);abort(active,'worker_heartbeat_reporter_closed')}
  }
  function unavailable(): void {
    if(lifecycle==='closed')return
    try {sequence.transition({type:'loop_unavailable'})}
    catch(error){
      // An explicit caller drain is terminal in the original sequence. A
      // transport outcome cannot rewrite that caller declaration either.
      if(!(error instanceof WorkerHeartbeatReportSequenceError&&error.code==='worker_heartbeat_report_sequence_draining'))closeWith('sequence_failure')
    }
  }
  function expire(current: Attempt): void {
    if(active!==current)return
    current.deadlineExpired=true;clearDeadline(current)
    unavailable();abort(current,'worker_heartbeat_send_deadline')
  }
  function deadline(current: Attempt): void {
    current.timer=undefined
    if(active!==current||lifecycle==='closed')return
    const remaining=current.deadline-monotonicNow()
    if(remaining>0){current.timer=setTimeout(()=>deadline(current),Math.max(1,Math.ceil(remaining)));return}
    expire(current)
  }
  function scheduleNext(): void {
    if(lifecycle!=='running'||active||nextTimer!==undefined)return
    nextTimer=setTimeout(()=>{nextTimer=undefined;attempt()},selected.intervalMs)
  }
  function settled(current: Attempt,result: Completion): void {
    if(active!==current)return
    // A blocked event loop may deliver promise settlement before the timer's
    // callback; a late result still cannot become an on-time completion.
    if(monotonicNow()>=current.deadline)expire(current)
    clearDeadline(current)
    lastSettled=Object.freeze({sequence:current.report.sequence,result,
      deadlineExpired:current.deadlineExpired,abortRequested:current.abortRequested})
    active=undefined
    if(result!=='resolved')unavailable()
    // No ACK value is read. It never establishes ready or reopens a close.
    scheduleNext()
  }
  function attempt(): void {
    if(lifecycle!=='running'||active)return
    let report: WorkerHeartbeatReport
    try {report=sequence.nextReport()}
    catch(error){closeWith(error instanceof WorkerHeartbeatReportSequenceError&&error.code==='worker_heartbeat_report_sequence_exhausted'?'sequence_exhausted':'sequence_failure');return}
    attempts=report.sequence
    const current: Attempt={report,controller:new NativeAbortController(),deadline:monotonicNow()+selected.sendDeadlineMs,
      deadlineExpired:false,abortRequested:false,completion:'pending',timer:undefined}
    // Reserve before invoking caller code, including synchronous reentrancy.
    active=current;current.timer=setTimeout(()=>deadline(current),selected.sendDeadlineMs)
    let completion: Promise<void>
    try {completion=send(report,Object.freeze({signal:current.controller.signal,
      timeoutMs:selected.sendDeadlineMs,deadlineMonotonicMs:current.deadline}))}
    catch {settled(current,'threw');return}
    if(monotonicNow()>=current.deadline)expire(current)
    try {
      // Native Promise observation does not read an adapter's .then getter or
      // accept an immediate ACK/void as proof detached I/O has stopped.
      void observePromise.call(completion,()=>settled(current,'resolved'),()=>settled(current,'rejected'))
    } catch {
      current.completion='unobservable';unavailable()
      // No observable completion => never release this slot or retry it.
    }
  }
  function start(): WorkerHeartbeatBoundedReporterSnapshot {
    if(lifecycle==='closed')throw new WorkerHeartbeatBoundedReporterError('worker_heartbeat_bounded_reporter_closed')
    if(lifecycle==='stopped'){lifecycle='running';attempt()}
    return snapshot()
  }
  function transition(event: unknown): void {
    if(lifecycle==='closed')throw new WorkerHeartbeatBoundedReporterError('worker_heartbeat_bounded_reporter_closed')
    sequence.transition(event)
  }
  function close(): WorkerHeartbeatBoundedReporterSnapshot {closeWith('caller_closed');return snapshot()}
  return Object.freeze({start,transition,snapshot,close})
}

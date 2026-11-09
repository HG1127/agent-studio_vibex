import {useCallback,useEffect,useId,useRef,useState} from 'react'
import {ShieldCheck} from 'lucide-react'
import type {DesktopComputerState} from '@/lib/desktopConnectionBridge'

type Confirmation=DesktopComputerState['confirmations'][number]
type Props={confirmation:Confirmation;deviceName:string;pendingCount:number;expanded:boolean;blocked:boolean;onReveal:()=>void;onRespond:(consent:boolean)=>Promise<unknown>;onRefresh:()=>Promise<void>}
const button='min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-secondary disabled:opacity-40'

/** Presents the existing private local review; only an explicit reply can approve. */
export function DesktopOperationConfirmation({confirmation,deviceName,pendingCount,expanded,blocked,onReveal,onRespond,onRefresh}:Props){
 const titleId=useId(),detailsId=useId(),details=useRef<HTMLElement>(null),frame=useRef<number|undefined>(undefined),replying=useRef(false)
 const [consent,setConsent]=useState(false),[now,setNow]=useState(Date.now),[inView,setInView]=useState(false),[revealed,setRevealed]=useState(false)
 const seconds=Number.isFinite(confirmation.expiresAt)?Math.max(0,Math.ceil((confirmation.expiresAt-now)/1000)):0
 const expired=seconds===0,title=confirmation.kind==='application'?'请确认本次应用操作':'请确认本机授权变更'
 const focusDetails=useCallback(()=>{
  if(frame.current!==undefined)cancelAnimationFrame(frame.current)
  frame.current=requestAnimationFrame(()=>{
   if(document.visibilityState!=='visible'||document.querySelector('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]'))return
   const element=details.current
   if(!element||element.closest('[aria-hidden="true"],[inert]'))return
   element.scrollIntoView({block:'center',behavior:'auto'})
   element.focus({preventScroll:true})
   if(document.activeElement===element)setRevealed(true)
  })
 },[])
 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),1000)
  return()=>{clearInterval(timer);if(frame.current!==undefined)cancelAnimationFrame(frame.current)}
 },[])
 useEffect(()=>{
  if(!expanded||revealed)return
  focusDetails()
  // A settings/approval dialog keeps its focus. Once it closes, or the app
  // becomes visible, finish the pending reveal exactly once for this review.
  const observer=new MutationObserver(focusDetails)
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal','data-state','aria-hidden','inert']})
  document.addEventListener('visibilitychange',focusDetails)
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',focusDetails);if(frame.current!==undefined)cancelAnimationFrame(frame.current)}
 },[expanded,revealed,focusDetails])
 useEffect(()=>{
  if(!expanded)return
  const element=details.current
  if(!element||typeof IntersectionObserver==='undefined')return
  const observer=new IntersectionObserver(entries=>setInView(entries[0]?.isIntersecting===true),{threshold:0.1})
  observer.observe(element)
  return()=>observer.disconnect()
 },[expanded])
 const reveal=()=>{onReveal();focusDetails()}
 const respond=async(ok:boolean)=>{
  // The native service checks the deadline too. Recheck here at click time,
  // even if a throttled timer still displays an earlier remaining second.
  if(blocked||replying.current||!Number.isFinite(confirmation.expiresAt)||Date.now()>=confirmation.expiresAt||ok&&!consent)return
  replying.current=true;setConsent(false)
  try{await onRespond(ok)}finally{replying.current=false}
 }
 return <>
  {expanded&&<section ref={details} id={detailsId} tabIndex={-1} role="region" aria-labelledby={titleId} className="mt-4 space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary">
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={titleId} className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/>{title}</h3><span aria-label="本机确认剩余时间" className={'rounded-full px-2.5 py-1 text-xs font-semibold '+(expired||seconds<=15?'bg-destructive/10 text-destructive':'bg-background text-primary')}>{expired?'确认已到期':'剩余 '+seconds+' 秒'}</span></div>
   <p className="text-xs text-muted-foreground">目标电脑：{deviceName}{pendingCount>1?' · 另有 '+(pendingCount-1)+' 项待确认':''}</p>
   <p role="status" className="text-sm leading-6">{expired?'此请求已到期，不能继续确认。请刷新状态，查看原任务的停止原因后再决定下一步。':'正在等待你确认，确认后才执行本次操作。到期后停止等待，不会自动批准。'}</p>
   <p tabIndex={0} aria-label="本次操作内容" className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-background p-3 text-sm leading-6">{confirmation.message}</p>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={blocked||expired} onChange={e=>setConsent(e.target.checked)}/>我已核对目标、内容，并同意本次操作。</label>
   <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked||expired} onClick={()=>void respond(false)}>拒绝</button><button type="button" className={button+' bg-primary text-primary-foreground'} disabled={blocked||expired||!consent} onClick={()=>void respond(true)}>确认应用</button>{expired&&<button type="button" className={button} onClick={()=>void onRefresh()}>刷新确认状态</button>}</div>
  </section>}
  {(!expanded||!inView)&&<button type="button" aria-label="查看待确认本机操作" aria-controls={detailsId} onClick={reveal} className="fixed bottom-36 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-3 text-left text-sm shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:bottom-20 lg:right-6"><ShieldCheck className="h-5 w-5 shrink-0 text-primary"/><span><strong className="block">{expired?'本机确认已到期':'本机操作待确认'}</strong><span className="block text-xs text-muted-foreground">{expired?'查看状态':'剩余 '+seconds+' 秒 · 点击查看'}</span></span></button>}
 </>
}

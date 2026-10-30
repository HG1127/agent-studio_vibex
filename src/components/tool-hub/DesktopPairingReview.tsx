import {useEffect,useRef,useState} from 'react'
import {FolderOpen,ShieldCheck} from 'lucide-react'
import {desktopComputerRequest} from '@/lib/desktopComputer'
import type {DesktopComputerState} from '@/lib/desktopConnectionBridge'
import {decodeRhToken} from '@/lib/studioAuth'
const button='min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium disabled:opacity-40'
export function DesktopPairingReview(){
 const owner=decodeRhToken()?.sub
 const [state,setState]=useState<DesktopComputerState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false)
 const alive=useRef(true),locked=useRef(false)
 useEffect(()=>{alive.current=true;let polling=false
  const poll=async()=>{if(polling)return;polling=true;try{const next=await desktopComputerRequest('state');if(alive.current&&decodeRhToken()?.sub===owner){setState(next);setError('')}}catch(e){if(alive.current)setError((e as Error).message)}finally{polling=false}}
  void poll();const timer=setInterval(()=>void poll(),1500)
  return()=>{alive.current=false;clearInterval(timer)}
 },[owner])
 const act=async(action:string,input?:Record<string,unknown>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');setConsent(false);try{const next=await desktopComputerRequest(action,input);if(alive.current&&decodeRhToken()?.sub===owner)setState(next)}catch(e){if(alive.current)setError((e as Error).message)}finally{locked.current=false;if(alive.current)setBusy(false)}}
 const review=state?.review
 useEffect(()=>setConsent(false),[review?.reviewId])
 return <section data-desktop-pairing-review className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
  <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/>确认本机访问范围</h3>
  {review?<><dl className="space-y-2 break-all text-sm"><div><dt className="text-muted-foreground">设备 / 工作台</dt><dd>{review.name} · {review.server}</dd></div>{review.origins.length>0&&<div><dt className="text-muted-foreground">允许访问的网站</dt><dd>{review.origins.join('、')}</dd></div>}{review.mode!=='browser'&&<div><dt className="text-muted-foreground">{review.kind==='file'?'只读文件':'工作文件夹'}</dt><dd>{review.folder}{review.folder==='专用工作文件夹'?'（由应用创建的专用目录）':''}</dd></div>}</dl>
   {review.mode!=='browser'&&<><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||state?.busy||review.expired} onClick={()=>void act('folder',{scope:'connect'})}><FolderOpen className="mr-1 inline h-4 w-4"/>选择文件夹</button><button type="button" className={button} disabled={busy||state?.busy||review.expired} onClick={()=>void act('file')}>选择单个文件</button></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!review.readOnly} disabled={busy||state?.busy||review.kind==='file'||review.expired} onChange={e=>void act('access',{scope:'connect',readOnly:!e.target.checked})}/>允许在此文件夹新建文件、文件夹和复制文件（不覆盖）</label></>}
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy||review.expired} onChange={e=>setConsent(e.target.checked)}/>我确认以上范围，只向当前账号授权这台电脑。</label>
   <button type="button" className={button+' bg-primary text-primary-foreground'} disabled={!consent||busy||state?.busy||review.expired} onClick={()=>void act('connect',{reviewId:review.reviewId,consent:true})}>{busy?'正在处理…':'确认连接并启动'}</button>
   {review.expired&&<p role="alert" className="text-sm text-destructive">本次准备已过期，请更新当前设备的授权凭证。</p>}
  </>:<p className="text-sm text-muted-foreground">{state?.notice||'正在核实本机准备状态；已确认的连接会自动上线。'}</p>}
  {state?.selection&&<button type="button" className={button} onClick={()=>void desktopComputerRequest('picker.cancel',{id:state.selection!.id}).catch(e=>setError(e.message))}>取消系统选择</button>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>
}

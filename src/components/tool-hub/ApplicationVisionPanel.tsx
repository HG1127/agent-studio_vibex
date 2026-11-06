import {useState} from 'react'
export type VisualObservation={observation:string|null;mode:'vision';imageSize:{width:number;height:number};actionable:boolean;window:{id:string};contentsVerified?:boolean}
type Action={action:'click'|'type'|'key'|'scroll';text?:string;key?:string;scrollY?:number}
export function ApplicationVisionPanel({observation,image,disabled,expired,canControl,onAction,text,onTextChange}:{observation:VisualObservation;image:string;disabled:boolean;expired:boolean;canControl:boolean;onAction:(point:{x:number;y:number},action:Action)=>void;text:string;onTextChange:(text:string)=>void}){
 const [selection,setSelection]=useState<{token:string|null;point:{x:number;y:number}}|null>(null),[key,setKey]=useState('Enter')
 const point=selection?.token===observation.observation?selection.point:null
 const blocked=disabled||expired||!canControl||!observation.actionable||!point
 const button='min-h-10 rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-40'
 return <section aria-label="应用视觉操作" className="space-y-3 rounded-xl border p-4">
  <div><h4 className="font-medium">视觉操作</h4><p className="mt-1 text-xs leading-6 text-muted-foreground">先在截图中选择位置，再确认具体动作。输入和按键沿用当前焦点；请先点击编辑区并核对新截图。每次操作仍需本人批准。</p></div>
  <button type="button" aria-label="在截图中选择操作位置" disabled={disabled||expired} className="relative block max-w-full overflow-hidden rounded-lg border" onClick={event=>{const bounds=event.currentTarget.getBoundingClientRect();setSelection({token:observation.observation,point:{x:Math.min(observation.imageSize.width-1,Math.max(0,Math.floor((event.clientX-bounds.left)*observation.imageSize.width/bounds.width))),y:Math.min(observation.imageSize.height-1,Math.max(0,Math.floor((event.clientY-bounds.top)*observation.imageSize.height/bounds.height)))}})}}>
   <img src={image} alt="本次已授权应用窗口截图" className="block h-auto max-w-full" draggable={false}/>
   {point&&<span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow" style={{left:point.x/observation.imageSize.width*100+'%',top:point.y/observation.imageSize.height*100+'%'}}/>}
  </button>
  {expired?<p role="status" className="text-sm text-amber-700">截图已过期，请重新观察。</p>:<p className="text-xs text-muted-foreground">{point?'已选择目标位置，尚未执行。':'点击截图选择目标；选择位置不会直接操作电脑。'}</p>}
  {canControl?<>
   <label className="block text-sm">追加输入内容<textarea className="mt-1 w-full rounded-lg border bg-background p-2" maxLength={4000} value={text} disabled={disabled} onChange={event=>onTextChange(event.target.value)}/></label>
   <div className="flex flex-wrap gap-2">
    <button type="button" className={button} disabled={blocked} onClick={()=>point&&onAction(point,{action:'click'})}>点击所选位置</button>
    <button type="button" className={button} disabled={blocked||!text||/[\x00-\x1f\x7f]/.test(text)} onClick={()=>point&&onAction(point,{action:'type',text})}>向当前焦点输入</button>
    <select aria-label="视觉操作按键" className={button} value={key} disabled={disabled} onChange={event=>setKey(event.target.value)}>{['Enter','Tab','Escape','Backspace','Delete','Up','Down','Left','Right','Home','End','PageUp','PageDown'].map(value=><option key={value}>{value}</option>)}</select>
    <button type="button" className={button} disabled={blocked} onClick={()=>point&&onAction(point,{action:'key',key})}>发送按键</button>
    <button type="button" className={button} disabled={blocked} onClick={()=>point&&onAction(point,{action:'scroll',scrollY:3})}>向下滚动</button>
    <button type="button" className={button} disabled={blocked} onClick={()=>point&&onAction(point,{action:'scroll',scrollY:-3})}>向上滚动</button>
   </div>
  </>:<p className="text-sm text-muted-foreground">当前只允许查看窗口截图。</p>}
 </section>
}

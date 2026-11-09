import {subscribeStudioSessionPrivacy} from './studioSessionPrivacy.ts'
/** One application-owned dialog queue; no window.confirm/alert/prompt.
 * No HTML interpolation, no cross-user state and no native fallback.
 */
export type StudioDialogMode="confirm"|"notice"|"input"
export type StudioDialogOptions={
  title?:string
  confirmLabel?:string
  cancelLabel?:string
  destructive?:boolean
  placeholder?:string
}
export type StudioDialogRequest={
  id:number
  mode:StudioDialogMode
  message:string
  options:StudioDialogOptions
}
type Answer=boolean|string|null
type Pending={request:StudioDialogRequest;resolve:(answer:Answer)=>void}
let serial=0
let active:Pending|null=null
const queue:Pending[]=[]
const listeners=new Set<(request:StudioDialogRequest|null)=>void>()
function publish(){for(const notify of listeners)notify(active?.request||null)}
function cancelPending(){
  const current=active,waiting=queue.splice(0)
  active=null
  if(current)current.resolve(current.request.mode==="input"?null:false)
  for(const pending of waiting)pending.resolve(pending.request.mode==="input"?null:false)
  publish()
}
// Invalidation denies old dialogs; it never grants or restores identity.
subscribeStudioSessionPrivacy(cancelPending)
function advance(){
  if(!active&&queue.length)active=queue.shift()||null
  publish()
}
function request(mode:StudioDialogMode,message:string,options:StudioDialogOptions={}):Promise<Answer>{
  // React host must be present; fail closed for any denied/unsafe action.
  if(listeners.size===0)return Promise.resolve(mode==="input"?null:false)
  return new Promise(resolve=>{
    queue.push({request:{id:++serial,mode,message:String(message).slice(0,6000),options},resolve})
    if(!active)advance()
  })
}
export function confirmInStudio(message:string,options:StudioDialogOptions={}):Promise<boolean>{
  return request("confirm",message,options).then(result=>result===true)
}
export async function noticeInStudio(message:string,options:StudioDialogOptions={}):Promise<void>{
  await request("notice",message,options)
}
export function inputInStudio(message:string,options:StudioDialogOptions={}):Promise<string|null>{
  return request("input",message,options).then(value=>typeof value==="string"?value:null)
}
export function subscribeStudioDialogs(listener:(request:StudioDialogRequest|null)=>void):()=>void{
  listeners.add(listener)
  listener(active?.request||null)
  return()=>{
    listeners.delete(listener)
    if(listeners.size===0)cancelPending()
  }
}
export function respondToStudioDialog(id:number,answer:Answer):void{
  if(!active||active.request.id!==id)return
  const pending=active
  active=null
  pending.resolve(answer)
  advance()
}

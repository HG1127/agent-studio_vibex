import {randomBytes} from 'node:crypto'
import {mcpResult} from './result.mjs'
import {applicationVisionNative} from './application-vision-native.mjs'

const keys=['Enter','Tab','Escape','Backspace','Delete','Up','Down','Left','Right','Home','End','PageUp','PageDown']
const exact=(args,allowed,required=allowed)=>{if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw Error('invalid_application_arguments')}
export function registerApplicationVision({permission,addTool,checked,windows,confirm,invalidateControls=()=>{},clock=Date.now,native=applicationVisionNative}){
 const observations=new Map(),desktop=permission.grants.filter(g=>g.adapter==='desktop'),controlled=desktop.filter(g=>g.control),allowed=new Set(desktop.map(g=>g.id)),writeAllowed=new Set(controlled.map(g=>g.id))
 if(!permission.images||!desktop.length)return {close(){},invalidate(){}}
 const app=list=>({type:'string',enum:list.map(g=>g.id)}),str={type:'string'}
 function observation(g,view,receipt={}){
  const w=view?.window,iw=view?.imageWidth,ih=view?.imageHeight
  if(!view?.image||view.imageError)throw Error(view?.imageError||'application_capture_failed')
  if(!w||![w.x,w.y,w.width,w.height,w.pid,iw,ih].every(Number.isInteger)||w.width<40||w.height<40||iw<1||ih<1||!/^\d+$/.test(w.id))throw Error('application_capture_failed')
  const actionable=g.control&&w.foreground===true,token=actionable?randomBytes(16).toString('hex'):null
  const text={application:g.name,mode:'vision',...receipt,window:{id:w.id,width:w.width,height:w.height,foreground:w.foreground},imageSize:{width:iw,height:ih},captureSource:view.imageSource||'window',coordinateSpace:'image_pixels',actionable,observation:token,expiresInSeconds:token?30:0,message:actionable?'坐标必须来自本次截图；输入只追加文字，不清空草稿。完成操作后核对新截图，提交或发送结果不确定时不得重放。':'只读截图。操作需要控制授权、前台窗口和新的观察凭据。'}
  const result=mcpResult({content:[{type:'text',text:JSON.stringify(text)},{type:'image',mimeType:'image/png',data:view.image}]},true)
  if(token)observations.set(g.id,{token,created:clock(),window:{...w},iw,ih})
  return result
 }
 async function observe(g,window,activate,signal){
  observations.delete(g.id);invalidateControls(g.id)
  if(typeof window!=='string'||!/^\d{1,20}$/.test(window))throw Error('invalid_application_arguments')
  const selected=(await windows(g,signal)).find(w=>w.id===window);if(!selected)throw Error('application_window_changed')
  if(activate&&!g.control)throw Error('application_control_denied')
  const shouldActivate=activate&&selected.foreground!==true
  if(shouldActivate){if(!await confirm({kind:'application',message:'应用：'+g.name+'\n窗口：'+selected.title+'\n操作：激活已授权窗口并获取窗口截图。截图将提供给本次模型；不点击、不输入、不发送。'},signal))throw Error('application_action_declined');await checked(g.id)}
  signal?.throwIfAborted();const view=await native({action:'observe',path:g.windowPath||g.path,window,activate:shouldActivate},{signal})
  if(['application_foreground_unavailable','application_window_occluded'].includes(view?.imageError))return JSON.stringify({application:g.name,mode:'vision',status:view.imageError==='application_window_occluded'?'window_occluded':'window_background',window:{id:window},actionable:false,observation:null,diagnostic:view.imageError,message:g.control?'窗口截图需要授权窗口处于前台且无遮挡。可经本人确认使用 apps.observe_visual activate:true 重新观察；若有覆盖窗口请本人处理。不重新启动、点击或发送。':'窗口截图需要前台无遮挡，请本人切回授权窗口后重新观察。只读授权不能激活或输入。'})
  return observation(g,view)
 }
 addTool('apps.observe_visual','视觉观察已授权应用窗口，跳过控件树。截图图片坐标与30秒一次性凭据供 act_visual 使用。截图须已授权；activate:true 须本机确认。',{app:app(desktop),window:str,activate:{type:'boolean'}},async(args,signal)=>{
  exact(args,['app','window','activate'],['app','window']);if(!allowed.has(args.app))throw Error('application_denied');if(args.activate!==undefined&&typeof args.activate!=='boolean')throw Error('invalid_application_arguments');return observe(await checked(args.app),args.window,args.activate===true,signal)
 },['app','window'])
 if(controlled.length)addTool('apps.act_visual','按最新窗口截图的图片坐标点击、输入、按键或滚动。无需控件编号，每次仍须本机确认；只能操作原授权窗口。操作后返回新截图，accepted 仅表示动作回执，不代表业务完成。',{app:app(controlled),observation:str,x:{type:'integer'},y:{type:'integer'},action:{type:'string',enum:['click','type','key','scroll']},text:{type:'string',maxLength:4000},key:{type:'string',enum:keys},scrollY:{type:'integer',minimum:-10,maximum:10}},async(args,signal)=>{
  exact(args,['app','observation','x','y','action','text','key','scrollY'],['app','observation','x','y','action'])
  if(!writeAllowed.has(args.app))throw Error('application_control_denied')
  const g=await checked(args.app),prior=observations.get(g.id);observations.delete(g.id);invalidateControls(g.id)
  if(!g.control)throw Error('application_control_denied')
  if(!prior||prior.token!==args.observation||clock()-prior.created>30000)throw Error('application_observation_expired')
  if(!['click','type','key','scroll'].includes(args.action)||!Number.isInteger(args.x)||!Number.isInteger(args.y)||args.x<0||args.y<0||args.x>=prior.iw||args.y>=prior.ih)throw Error('application_coordinate_denied')
  if(args.action==='type'?(typeof args.text!=='string'||!args.text||args.text.length>4000||/[\x00-\x1f\x7f]/.test(args.text)):args.text!==undefined)throw Error('invalid_application_arguments')
  if(args.action==='key'?!keys.includes(args.key):args.key!==undefined)throw Error('invalid_application_arguments')
  if(args.action==='scroll'?(!Number.isInteger(args.scrollY)||!args.scrollY||Math.abs(args.scrollY)>10):args.scrollY!==undefined)throw Error('invalid_application_arguments')
  const started=clock(),receiptId=randomBytes(16).toString('hex'),message='应用：'+g.name+'\n操作：'+args.action+'\n截图坐标：'+args.x+', '+args.y+(args.action==='type'?'\n追加输入：'+args.text:'')+(args.action==='key'?'\n按键：'+args.key:'')+(args.action==='scroll'?'\n滚动格数（正数向下）：'+args.scrollY:'')+'\n只操作本次截图中的授权窗口。请核对目标、内容及可能的发送效果；拒绝不会自动重试。'
  if(!await confirm({kind:'application',message},signal))throw Error('application_action_declined')
  if(clock()-started>90000)throw Error('application_observation_expired')
  await checked(g.id);signal?.throwIfAborted()
  const w=prior.window,result=await native({action:'act',path:g.windowPath||g.path,window:w.id,title:w.title,pid:w.pid,windowX:w.x,windowY:w.y,width:w.width,height:w.height,x:Math.floor(args.x*w.width/prior.iw),y:Math.floor(args.y*w.height/prior.ih),kind:args.action,text:args.text||'',key:args.key||'',scrollY:args.scrollY||0},{signal})
  if(result?.accepted!==true)throw Error('application_action_unconfirmed')
  const receipt={receiptId,accepted:true,action:args.action,contentsVerified:false}
  try{return observation(g,await native({action:'observe',path:g.windowPath||g.path,window:w.id,activate:false},{signal}),receipt)}
  catch(error){return JSON.stringify({application:g.name,...receipt,actionable:false,observation:null,reobserveOnly:true,message:'动作已执行，但后续截图未确认。请重新观察核对结果，禁止重复提交或发送。',diagnostic:/^application_[a-z_]+$/.test(error.message)?error.message:'application_capture_failed'})}
 },['app','observation','x','y','action'])
 return {close(){observations.clear()},invalidate(id){observations.delete(id)}}
}

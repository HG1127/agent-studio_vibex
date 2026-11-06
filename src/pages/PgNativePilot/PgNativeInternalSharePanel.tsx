import {useEffect,useRef,useState} from 'react'
import {TemplateMarketSnapshotView} from './PgNativeTemplateMarketPanel.tsx'
import {createPgNativeInternalShareSession,emptyInternalShareView,type InternalShareView,type PgNativeInternalShareSession} from '../../lib/pgNativeInternalShareSession.ts'
import type {PgNativeInternalShareApi} from '../../lib/pgNativeInternalShare.ts'

export type PgNativeInternalSharePanelProps={api?:PgNativeInternalShareApi;employeeId:string;scopeKey:string;active:boolean;available?:boolean;writes?:boolean;onExpired:()=>void;onChanged?:()=>void;onConfigureAgent:(id:string)=>void}
const button='min-h-10 rounded-lg border px-3 py-2 text-sm disabled:opacity-40',primary=button+' bg-slate-900 text-white',input='mt-1 block w-full min-w-0 rounded-lg border p-2 text-sm disabled:opacity-50'
const statusLabels={active:'待领取',used:'已领取',revoked:'已撤销',expired:'已过期',inactive:'已停用'}
export function PgNativeInternalSharePresentation({view,session,onConfigureAgent}:{view:InternalShareView;session?:PgNativeInternalShareSession;onConfigureAgent:(id:string)=>void}){
 if(!view.active)return null
 const locked=view.busy||Boolean(view.pending)||!view.writes,ready=view.available&&Boolean(session),sourceReady=view.listStatus==='ready',revoke=view.list?.invites.find(row=>row.id===view.revokeId)
 return <section aria-label="内部模板共享" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
  <h2 className="text-lg font-semibold">内部模板共享</h2>
  {!ready?<p role="status">内部模板共享暂未开放。</p>:<>
   <p className="text-sm text-slate-600">将检查过的助手文字方案交给一位同事。共享码 7 天内有效，只能领取一次。</p>
   {!view.writes?<p role="status">当前只可查看已有共享。</p>:null}
   <div className="space-y-3 rounded-xl border p-4"><h3 className="font-medium">创建共享码</h3>
    <label className="block text-sm">我的助手方案<select className={input} value={view.selected} disabled={locked||!sourceReady} onChange={event=>session?.select(event.target.value)}><option value="">请选择已保存的方案</option>{view.list?.specs.map(spec=><option key={spec.id} value={spec.id}>{spec.name}</option>)}</select></label>
    {sourceReady&&!view.list?.specs.length?<p className="text-sm">请先保存自己的助手方案。</p>:null}
    <button type="button" className={button} disabled={locked||!view.selected} onClick={()=>{void session?.preview()}}>预览将共享的内容</button>
    {view.preview?<div className="space-y-3"><h4 className="font-medium">共享预览：{view.preview.name}</h4><TemplateMarketSnapshotView spec={view.preview.snapshot.spec}/>
     <p className="text-sm">请逐项检查下面的文字。模型、工具连接、知识库和凭据已移除，文字中的敏感内容仍需你检查。</p>
     <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={view.confirmed} disabled={locked} onChange={event=>session?.confirmReview(event.target.checked)}/><span>我已逐项检查目标、范围、交付物、任务计划和完成条件，确认可以共享且不含敏感信息。</span></label>
     <button type="button" className={primary} disabled={locked||!view.confirmed} onClick={()=>{void session?.create()}}>确认创建一次性共享码</button>
    </div>:null}
    {view.code?<div className="space-y-2 rounded-lg bg-emerald-50 p-3"><label className="block text-sm">本次共享码<input className={input+' font-mono'} readOnly value={view.code} autoComplete="off" spellCheck={false} onFocus={event=>event.currentTarget.select()}/></label><p className="text-sm">请复制并交给指定同事。关闭后无法再次查看。</p><button type="button" className={button} onClick={()=>session?.hideCode()}>我已保存，隐藏共享码</button></div>:null}
   </div>
   <form aria-label="领取内部模板" className="space-y-3 rounded-xl border p-4" onSubmit={event=>{event.preventDefault();void session?.redeem()}}><h3 className="font-medium">领取同事的模板</h3>
    <label className="block text-sm">48 位共享码<input className={input+' font-mono'} value={view.redeemInput} maxLength={48} autoComplete="off" spellCheck={false} disabled={locked} onChange={event=>session?.setRedeemInput(event.target.value)}/></label><p className="text-sm">领取后保存为你的私人助手副本，需要配置自己的模型与资源。</p><button type="submit" className={primary} disabled={locked||view.redeemInput.trim().length!==48}>确认领取并保存副本</button>
   </form>
   <div className="space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">我创建的共享</h3><button type="button" className={button} disabled={view.busy} onClick={()=>{void session?.refresh()}}>刷新共享列表</button></div>
    {view.listStatus==='loading'?<p role="status">正在加载共享列表…</p>:view.listStatus==='error'?<p role="alert">共享列表暂时加载失败，请重新刷新。</p>:sourceReady?view.list?.invites.length?<ul className="space-y-2">{view.list.invites.map(row=><li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0 break-words"><p className="font-medium">{row.name}</p><p className="text-sm">{statusLabels[row.status]} · 到期时间 {new Date(row.expires_ms).toLocaleString('zh-CN')}</p></div>{row.status==='active'?<button type="button" className={button} disabled={locked} aria-label={'撤销「'+row.name+'」'} onClick={()=>session?.chooseRevoke(row.id)}>撤销共享</button>:null}</li>)}</ul>:<p role="status">还没有创建过共享。</p>:null}
   </div>
   {revoke?<div aria-label="确认撤销共享" className="space-y-2 rounded-lg bg-amber-50 p-3"><p>确认撤销「{revoke.name}」？撤销后同事无法再用该码领取。</p><div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={locked} onClick={()=>{void session?.revoke()}}>确认撤销共享</button><button type="button" className={button} disabled={locked} onClick={()=>session?.chooseRevoke(null)}>取消撤销</button></div></div>:null}
   {view.pending?<div role="status" className="space-y-2 rounded-lg bg-amber-50 p-3"><p>本次结果尚未确认。请查询原操作结果，避免重复创建或领取。</p><button type="button" className={button} disabled={view.busy} onClick={()=>{void session?.confirmOriginal()}}>查询原操作结果</button></div>:null}
   {view.receipt?.action==='redeem'?<div className="space-y-2 rounded-lg bg-emerald-50 p-3"><p>助手副本已保存。</p><button type="button" className={primary} disabled={view.busy} onClick={()=>{if(view.receipt?.action==='redeem')onConfigureAgent(view.receipt.spec_id)}}>配置我的模型与资源</button></div>:null}
   {view.notice?<p role="status">{view.notice}</p>:null}{view.busy?<p role="status">正在核对本次操作…</p>:null}{view.error?<p role="alert" className="text-sm text-rose-800">{view.error}</p>:null}
  </>}
 </section>
}
type Binding={api:PgNativeInternalShareApi;employeeId:string;scopeKey:string;session:PgNativeInternalShareSession;view:InternalShareView}
export default function PgNativeInternalSharePanel(props:PgNativeInternalSharePanelProps){
 const {api,employeeId,scopeKey,active,available,writes}=props,callbacks=useRef(props);callbacks.current=props
 const [binding,setBinding]=useState<Binding|null>(null)
 const session=api&&binding?.api===api&&binding.employeeId===employeeId&&binding.scopeKey===scopeKey&&binding.session.matchesScope(api,employeeId,scopeKey)?binding.session:undefined
 useEffect(()=>{
  if(!api){setBinding(null);return}
  const notify=(kind:'onExpired'|'onChanged')=>{const current=callbacks.current;if(current.api===api&&current.employeeId===employeeId&&current.scopeKey===scopeKey)current[kind]?.()}
  let model:PgNativeInternalShareSession
  model=createPgNativeInternalShareSession({api,employeeId,scopeKey,onChange:view=>setBinding({api,employeeId,scopeKey,session:model,view}),onExpired:()=>notify('onExpired'),onChanged:()=>notify('onChanged')})
  setBinding({api,employeeId,scopeKey,session:model,view:model.getView()});return()=>model.dispose()
 },[api,employeeId,scopeKey])
 useEffect(()=>{session?.activate(active,available===true,writes===true)},[session,active,available,writes])
 const view=active&&session&&binding?binding.view:emptyInternalShareView()
 return <PgNativeInternalSharePresentation key={employeeId+':'+scopeKey} view={view} session={session} onConfigureAgent={props.onConfigureAgent}/>
}

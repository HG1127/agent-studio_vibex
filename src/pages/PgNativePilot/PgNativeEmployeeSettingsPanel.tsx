import {useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type PgNativeStaff,type PgNativeEmployee,createPgNativePilotApi} from "../../lib/pgNativePilotApi.ts"
import type {EmployeeChange} from "../../lib/pgNativeEmployeeGovernance.ts"

type Props={api:ReturnType<typeof createPgNativePilotApi>;profile:PgNativeStaff;enabled:boolean;active:boolean;onExpire:()=>void}
const field="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm",button="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
const message=(e:unknown)=>e instanceof PgNativePilotError?e.code:e instanceof Error?e.message:"请求未确认，请核对原请求。"
export function PgNativeEmployeeSettingsPanel({api,profile,enabled,active,onExpire}:Props){
  const [items,setItems]=useState<PgNativeEmployee[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const [target,setTarget]=useState<PgNativeEmployee|null>(null),[admin,setAdmin]=useState(false),[allowed,setAllowed]=useState(true),[sharing,setSharing]=useState(true),[confirmed,setConfirmed]=useState(false)
  const [pending,setPending]=useState<EmployeeChange|null>(null)
  const [email,setEmail]=useState(""),[name,setName]=useState(""),[password,setPassword]=useState(""),[newAdmin,setNewAdmin]=useState(false),[newShare,setNewShare]=useState(true)
  const [oldPassword,setOldPassword]=useState(""),[newPassword,setNewPassword]=useState("")
  const life=useRef(0),reads=useRef(0),inFlight=useRef(false)
  useEffect(()=>{life.current++;return()=>{life.current++}},[])
  useEffect(()=>{if(!active){setPassword("");setOldPassword("");setNewPassword("")}},[active])
  const refresh=async()=>{
    if(!profile.is_admin)return
    const session=life.current,ticket=++reads.current
    try{const rows=await api.listEmployees(100);if(session===life.current&&ticket===reads.current)setItems(rows)}
    catch(e){if(session===life.current){if(e instanceof PgNativePilotError&&e.status===401)onExpire();else setError(message(e))}}
  }
  useEffect(()=>{void refresh();return()=>{reads.current++}},[api,profile.id,profile.is_admin]) // profile and API bind this mounted employee instance.
  const begin=()=>{if(inFlight.current)return null;inFlight.current=true;setBusy(true);setError("");setNotice("");return life.current}
  const done=(session:number)=>{inFlight.current=false;if(session===life.current)setBusy(false)}
  const recover=async(confirmOnly:boolean)=>{
    if(!pending)return
    const session=begin();if(session===null)return
    try{
      const result=await (confirmOnly?api.confirmEmployeeChange(pending):api.changeEmployee(pending))
      if(session!==life.current)return
      reads.current++;setPending(null);setTarget(null);setConfirmed(false);setNotice("账号设置已确认，版本 "+result.revision+"。");await refresh()
    }catch(e){if(session===life.current){
      if(e instanceof PgNativePilotError&&e.status===401){onExpire();return}
      // A read-only confirmation may safely return not-found. An unknown write
      // keeps the exact original choice; no new request ID is generated.
      if(!confirmOnly&&e instanceof PgNativePilotError&&e.status>=400&&e.status<500){setPending(null);setTarget(null)}
      setError(message(e))
    }}finally{done(session)}
  }
  const prepare=(event:FormEvent)=>{event.preventDefault();if(!target||!confirmed||pending||busy)return
    setPending({request_id:crypto.randomUUID(),target_id:target.id,expected_revision:target.revision,is_admin:admin,enabled:allowed,share_enabled:sharing,confirm:true});setTarget(null);setNotice("请发送已确认的账号设置。")}
  const create=async(event:FormEvent)=>{
    event.preventDefault();const session=begin();if(session===null)return
    try{await api.createGovernedEmployee({email:email.trim(),display_name:name.trim(),password,is_admin:newAdmin,share_enabled:newShare})
      if(session===life.current){setEmail("");setName("");setNotice("员工账号已创建。");await refresh()}}
    catch(e){if(session===life.current){if(e instanceof PgNativePilotError&&e.status===401)onExpire();else setError(message(e)+"；创建结果不明时，请先刷新并核对邮箱。")}}
    finally{setPassword("");done(session)}
  }
  const changePassword=async(event:FormEvent)=>{
    event.preventDefault();const session=begin();if(session===null)return
    try{await api.changePassword(oldPassword,newPassword);if(session===life.current)onExpire()}
    catch(e){if(session===life.current){if(e instanceof PgNativePilotError&&e.status===401)onExpire();else setError(message(e)+"；若结果未确认，请重新登录核对。")}}
    finally{setOldPassword("");setNewPassword("");done(session)}
  }
  return <section aria-label="员工账号治理" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5" hidden={!active}>
    <h2 className="font-semibold">账号与员工设置</h2>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {!enabled&&<p className="text-sm text-slate-600">当前环境只允许查看和核对已有设置。</p>}
    {profile.is_admin&&<>
      <div className="space-y-2">{items.map(item=><article className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" key={item.id}>
        <div><p>{item.display_name} · {item.is_admin?"管理员":"员工"} · {item.enabled&&item.status==="active"?"启用":"已停用"}</p><p className="text-xs text-slate-500">{item.email} · 内部 Agent 模板分享{item.share_enabled?"开启":"关闭"} · 版本 {item.revision}</p></div>
        <button type="button" className={button} disabled={!enabled||busy||!!pending} aria-label={"编辑员工 "+item.email} onClick={()=>{setTarget(item);setAdmin(item.is_admin);setAllowed(item.enabled);setSharing(item.share_enabled);setConfirmed(false)}}>编辑账号</button>
      </article>)}</div>
      <button type="button" className={button} disabled={busy} onClick={()=>void refresh()}>刷新员工账号</button>
      {target&&<form aria-label="修改员工设置" onSubmit={prepare} className="space-y-3 rounded-lg border p-3">
        <p>{target.display_name} · {target.email} · 当前版本 {target.revision}</p>
        <label className="block"><input type="checkbox" checked={admin} disabled={busy||target.id===profile.id} onChange={e=>{setAdmin(e.target.checked);setConfirmed(false)}}/> 管理员权限</label>
        <label className="block"><input type="checkbox" checked={allowed} disabled={busy||target.id===profile.id} onChange={e=>{setAllowed(e.target.checked);setConfirmed(false)}}/> 启用账号</label>
        <label className="block"><input type="checkbox" checked={sharing} disabled={busy} onChange={e=>{setSharing(e.target.checked);setConfirmed(false)}}/> 允许内部 Agent 模板分享</label>
        <p className="text-xs text-slate-600">角色或启用状态变化将使该员工的已有登录失效。停用后将阻止新的本人任务执行；已发出的调用须核对结果。</p>
        <label className="block"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> 我已核对该员工和上述权限变化。</label>
        <button className={button} disabled={!enabled||busy||!confirmed}>准备账号修改</button>
        <button type="button" className={button} onClick={()=>setTarget(null)}>取消</button>
      </form>}
      {pending&&<div className="space-y-2 rounded-lg border border-amber-300 p-3" aria-label="待确认账号请求">
        <p className="text-sm">员工 {items.find(i=>i.id===pending.target_id)?.email??pending.target_id} · 原版本 {pending.expected_revision} · {pending.is_admin?"管理员":"员工"} · {pending.enabled?"启用":"停用"} · 模板分享{pending.share_enabled?"开启":"关闭"}</p>
        <button type="button" className={button} disabled={busy} onClick={()=>void recover(true)}>核对账号原请求</button>
        <button type="button" className={button} disabled={busy||!enabled} onClick={()=>void recover(false)}>发送账号原请求</button>
      </div>}
      <form onSubmit={create} aria-label="创建员工账号" className="space-y-3 border-t pt-4">
        <h3 className="font-medium">创建账号</h3>
        <label className="block">新员工邮箱<input className={field} type="email" required value={email} disabled={!enabled||busy} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="block">员工姓名<input className={field} required maxLength={80} value={name} disabled={!enabled||busy} onChange={e=>setName(e.target.value)}/></label>
        <label className="block">初始密码<input className={field} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} disabled={!enabled||busy} onChange={e=>setPassword(e.target.value)}/></label>
        <label className="block"><input type="checkbox" checked={newAdmin} disabled={!enabled||busy} onChange={e=>setNewAdmin(e.target.checked)}/> 创建为管理员</label>
        <label className="block"><input type="checkbox" checked={newShare} disabled={!enabled||busy} onChange={e=>setNewShare(e.target.checked)}/> 允许新员工内部 Agent 模板分享</label>
        <button className={button} disabled={!enabled||busy||!!pending}>创建员工账号</button>
      </form>
    </>}
    <form onSubmit={changePassword} aria-label="修改本人密码" className="space-y-3 border-t pt-4">
      <h3 className="font-medium">修改本人密码</h3><p className="text-xs text-slate-600">修改后，本人的所有登录将失效，需要重新登录。</p>
      <label className="block">当前密码<input className={field} type="password" autoComplete="current-password" required maxLength={128} value={oldPassword} disabled={!enabled||busy} onChange={e=>setOldPassword(e.target.value)}/></label>
      <label className="block">新密码<input className={field} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} disabled={!enabled||busy} onChange={e=>setNewPassword(e.target.value)}/></label>
      <button className={button} disabled={!enabled||busy||!!pending}>修改本人密码并退出</button>
    </form>
  </section>
}

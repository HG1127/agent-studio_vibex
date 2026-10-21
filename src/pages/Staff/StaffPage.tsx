import { useEffect, useState, type FormEvent } from "react"
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, UsersRound } from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
type Employee={id:string;email:string;display_name:string;role:"admin"|"employee";active:boolean;share_enabled:boolean}
async function api<T>(method:string,path:string,body?:unknown):Promise<T>{
  const res=await fetch(getPocketBaseUrl()+path,{method,headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
  const data=await res.json().catch(()=>({})) as T&{error?:string}
  if(!res.ok)throw new Error(data.error||"request_failed")
  return data
}
export default function StaffPage(){
  const [me,setMe]=useState<Employee|null>(null)
  const [users,setUsers]=useState<Employee[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [name,setName]=useState("")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [role,setRole]=useState<"admin"|"employee">("employee")
  const [oldPassword,setOldPassword]=useState("")
  const [newPassword,setNewPassword]=useState("")
  const load=async()=>{
    setLoading(true);setError("")
    try{
      const self=await api<{user:Employee}>("GET","/api/studio/me")
      setMe(self.user)
      if(self.user.role==="admin"){
        const list=await api<{items:Employee[]}>("GET","/api/studio/users")
        setUsers(list.items)
      }
    }catch(e){setError((e as Error).message)}finally{setLoading(false)}
  }
  useEffect(()=>{
    let disposed=false
    void (async()=>{
      try{
        const self=await api<{user:Employee}>("GET","/api/studio/me")
        if(disposed)return
        setMe(self.user)
        if(self.user.role==="admin"){
          const list=await api<{items:Employee[]}>("GET","/api/studio/users")
          if(!disposed)setUsers(list.items)
        }
      }catch(e){
        if(!disposed)setError((e as Error).message)
      }finally{
        if(!disposed)setLoading(false)
      }
    })()
    return ()=>{disposed=true}
  },[])
  const create=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError("");setNotice("")
    try{
      await api("POST","/api/studio/users",{email,display_name:name,password,role,share_enabled:true})
      setName("");setEmail("");setPassword("");setRole("employee")
      await load();setNotice("员工账号已建立，可使用公司独立账号登录。")
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  const update=async(user:Employee,part:Partial<Employee>)=>{
    if("role" in part && part.role!==user.role &&
      !window.confirm("确认将「"+user.display_name+"」的角色从"+(user.role==="admin"?"管理员":"员工")+
        "改为"+(part.role==="admin"?"管理员":"员工")+"？此操作会立即改变员工权限。"))return
    if("active" in part && part.active===false &&
      !window.confirm("确认停用员工「"+user.display_name+"」的登录权限？进行中的任务可能需要人工处理。"))return
    if("share_enabled" in part && part.share_enabled===false &&
      !window.confirm("确认取消「"+user.display_name+"」共享 Agent 的权限？现有共享授权可能受到影响。"))return
    setBusy(true);setError("");setNotice("")
    try{
      await api("PATCH","/api/studio/users/"+encodeURIComponent(user.id),part)
      await load();setNotice("员工权限已更新。")
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  const changePassword=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError("");setNotice("")
    try{
      await api("POST","/api/studio/change-password",{old_password:oldPassword,new_password:newPassword})
      setOldPassword("");setNewPassword("");setNotice("密码修改成功，请重新登录。")
      window.setTimeout(()=>window.location.assign("/login"),900)
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  const inputStyle="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
  return <SiteShell><main className="min-h-screen flex-1 bg-background p-5 text-foreground md:p-8">
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">员工与权限</h1><p className="mt-1 text-sm text-muted-foreground">独立管理公司成员账号、共享授权和访问状态</p></div>
        <button type="button" aria-label="刷新员工权限列表" disabled={loading||busy} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={()=>void load()}><RefreshCw size={16}/>刷新</button>
      </header>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17}/>{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={17}/>{notice}</p>}
      {loading?<div className="flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={18}/>读取员工权限…</div>:
      <>{me?.role==="admin"&&<>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><UsersRound size={18}/>员工账号 <span className="text-sm font-normal text-muted-foreground">({users.length})</span></h2>
          <div className="space-y-2">{users.map(user=><div key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
            <div className="min-w-0 flex-1 basis-44"><p className="font-medium">{user.display_name} <span className="text-xs text-muted-foreground">· {user.role==="admin"?"管理员":"员工"}</span></p><p className="text-xs text-muted-foreground">{user.email}</p></div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={user.share_enabled} disabled={busy} onChange={e=>void update(user,{share_enabled:e.target.checked})}/>允许共享 Agent</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={user.active} disabled={busy||user.id===me.id} onChange={e=>void update(user,{active:e.target.checked})}/>启用账号</label>
            <select aria-label={"设置 "+user.display_name+" 的账号角色"} className="rounded-lg border bg-background px-2 py-1.5" value={user.role} disabled={busy||user.id===me.id}
              onChange={e=>void update(user,{role:e.target.value as Employee["role"]})}><option value="employee">员工</option><option value="admin">管理员</option></select>
          </div>)}</div>
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><ShieldCheck size={18}/>添加员工</h2>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <input className={inputStyle} aria-label="员工姓名" placeholder="员工姓名" value={name} required onChange={e=>setName(e.target.value)}/>
            <input className={inputStyle} aria-label="工作邮箱" type="email" placeholder="工作邮箱" value={email} required onChange={e=>setEmail(e.target.value)}/>
            <input className={inputStyle} aria-label="初始密码" type="password" placeholder="设置至少 12 位初始密码" minLength={12} value={password} required onChange={e=>setPassword(e.target.value)}/>
            <select aria-label="新员工的账号角色" className={inputStyle} value={role} onChange={e=>setRole(e.target.value as Employee["role"])}><option value="employee">普通员工</option><option value="admin">管理员</option></select>
            <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2">添加员工并启用共享权限</button>
          </form>
        </section>
      </>}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">修改自己的登录密码</h2>
        <form onSubmit={changePassword} className="flex max-w-lg flex-col gap-3">
          <input className={inputStyle} aria-label="当前登录密码" type="password" autoComplete="current-password" placeholder="当前密码" value={oldPassword} required onChange={e=>setOldPassword(e.target.value)}/>
          <input className={inputStyle} aria-label="新登录密码（不少于12位）" type="password" autoComplete="new-password" minLength={12} placeholder="新密码（不少于 12 位）" value={newPassword} required onChange={e=>setNewPassword(e.target.value)}/>
          <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">确认修改</button>
        </form>
      </section></>}
    </div>
  </main></SiteShell>
}

import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {AlertCircle,Check,CheckCircle2,ChevronLeft,ChevronRight,KeyRound,Loader2,LockKeyhole,Mail,Pencil,Plus,RefreshCw,Search,ShieldCheck,UserCheck,UsersRound,X} from "lucide-react"
import {SiteShell} from "@/components/site/SiteShell"
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {PasswordField} from "@/components/ui/PasswordField"
import {confirmInStudio} from "@/lib/studioDialogs"
import {pb,getPocketBaseUrl} from "@/lib/pb"
import {vibexAuthHeaders} from "@/lib/studioAuth"
import {accountError,passwordInputError,type EmployeeProfile as Employee} from "@/lib/accountUx"
type ListResult={items:Employee[];page:number;totalItems:number;totalPages:number;summary:{total:number;active:number;admins:number;sharing:number}}
type Editor={kind:"create"|"edit";original:Employee|null;display_name:string;email:string;role:Employee["role"];active:boolean;share_enabled:boolean;password:string;confirm:string}
type PasswordEditor={target:Employee|null;old:string;next:string;confirm:string}
const field="min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
const secondary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold transition hover:bg-secondary disabled:opacity-50"
const primary="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
async function api<T>(method:string,path:string,body?:unknown):Promise<T>{
  const res=await fetch(getPocketBaseUrl()+path,{method,headers:{"Content-Type":"application/json",...vibexAuthHeaders()},signal:AbortSignal.timeout(15000),...(body===undefined?{}:{body:JSON.stringify(body)})})
  const data=await res.json().catch(()=>({})) as T&{error?:string}
  if(!res.ok)throw Error(data.error||"request_failed")
  return data
}
function editorFor(user:Employee|null):Editor{return {kind:user?"edit":"create",original:user,display_name:user?.display_name||"",email:user?.email||"",role:user?.role||"employee",active:user?.active??true,share_enabled:user?.share_enabled??false,password:"",confirm:""}}
export default function StaffPage({accountOnly=false}:{accountOnly?:boolean}){
  const [me,setMe]=useState<Employee|null>(null),[data,setData]=useState<ListResult|null>(null)
  const [tab,setTab]=useState<"members"|"account">(accountOnly?"account":"members")
  const [search,setSearch]=useState(""),[query,setQuery]=useState(""),[roleFilter,setRoleFilter]=useState(""),[stateFilter,setStateFilter]=useState(""),[page,setPage]=useState(1)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const [editor,setEditor]=useState<Editor|null>(null),[passwordEditor,setPasswordEditor]=useState<PasswordEditor|null>(null),[formError,setFormError]=useState("")
  const sequence=useRef(0),mutation=useRef(false)
  const load=useCallback(async()=>{
    const seq=++sequence.current
    setLoading(true);setError("")
    try{
      const self=await api<{user:Employee}>("GET","/api/studio/me")
      if(seq!==sequence.current)return
      setMe(self.user)
      if(accountOnly||self.user.role!=="admin"){setData(null);setTab("account");return}
      const params=new URLSearchParams({page:String(page),perPage:"20",q:query,role:roleFilter,active:stateFilter})
      const list=await api<ListResult>("GET","/api/studio/users?"+params)
      if(seq===sequence.current){setData(list);if(list.page!==page)setPage(list.page)}
    }catch(err){if(seq===sequence.current)setError(accountError(err))}
    finally{if(seq===sequence.current)setLoading(false)}
  },[page,query,roleFilter,stateFilter,accountOnly])
  useEffect(()=>{void load();return()=>{sequence.current++}},[load])
  const openEditor=(user:Employee|null)=>{setFormError("");setEditor(editorFor(user))}
  const openPassword=(target:Employee|null)=>{setFormError("");setPasswordEditor({target,old:"",next:"",confirm:""})}
  const closeEditor=async()=>{
    if(busy)return
    const dirty=editor&&JSON.stringify(editor)!==JSON.stringify(editorFor(editor.original))
    if(dirty&&!await confirmInStudio("表单有尚未保存的修改，确认放弃并关闭？"))return
    setEditor(null);setFormError("")
  }
  const closePassword=async()=>{
    if(busy)return
    if(passwordEditor&&(passwordEditor.old||passwordEditor.next||passwordEditor.confirm)&&!await confirmInStudio("密码尚未修改，确认清空输入并关闭？"))return
    setPasswordEditor(null);setFormError("")
  }
  const saveMember=async(event:FormEvent)=>{
    event.preventDefault();if(!editor||mutation.current)return
    const current=editor
    if(!current.display_name.trim()){setFormError("请填写员工姓名。");return}
    if(current.kind==="create"){
      const invalid=passwordInputError(current.password)
      if(invalid){setFormError(invalid);return}
      if(current.password!==current.confirm){setFormError("两次输入的初始密码不一致。");return}
    }
    mutation.current=true;setBusy(true);setFormError("")
    try{
      const prior=current.original
      const warnings:string[]=[]
      if(prior&&prior.role!==current.role)warnings.push("角色调整为"+(current.role==="admin"?"管理员（可管理全部员工）":"普通员工"))
      if(prior?.active&&!current.active)warnings.push("停用登录权限，当前任务可能需要人工接管")
      if(prior?.share_enabled&&!current.share_enabled)warnings.push("关闭共享 Agent 权限")
      if(prior&&prior.email!==current.email.trim().toLowerCase())warnings.push("更换登录邮箱，成员以后需使用新邮箱登录")
      if(!prior&&current.role==="admin")warnings.push("新成员将拥有管理员权限")
      if(warnings.length&&!await confirmInStudio("即将更新「"+current.display_name.trim()+"」：\n"+warnings.join("；")+"。确认继续？"))return
      const payload={display_name:current.display_name.trim(),email:current.email.trim().toLowerCase(),role:current.role,share_enabled:current.share_enabled,...(prior?{active:current.active,expected_updated:prior.updated}:{password:current.password})}
      const result=await api<{user:Employee}>(prior?"PATCH":"POST",prior?"/api/studio/users/"+encodeURIComponent(prior.id):"/api/studio/users",payload)
      if(result.user.id===me?.id&&pb.authStore.record)pb.authStore.save(pb.authStore.token,{...pb.authStore.record,...result.user})
      setEditor(null);setNotice(prior?"已保存「"+result.user.display_name+"」的资料与权限。":"已创建「"+result.user.display_name+"」。请通过安全渠道告知初始密码。")
      await load()
    }catch(err){setFormError(accountError(err))}finally{mutation.current=false;setBusy(false)}
  }
  const savePassword=async(event:FormEvent)=>{
    event.preventDefault();if(!passwordEditor||mutation.current)return
    const current=passwordEditor,invalid=passwordInputError(current.next)
    if(invalid){setFormError(invalid);return}
    if(current.next!==current.confirm){setFormError("两次输入的新密码不一致。");return}
    mutation.current=true;setBusy(true);setFormError("")
    try{
      if(current.target){
        if(!await confirmInStudio("确认重置「"+current.target.display_name+"」的密码？旧密码及旧登录状态将失效，请通过安全渠道通知本人。"))return
        await api("POST","/api/studio/users/"+encodeURIComponent(current.target.id)+"/reset-password",{new_password:current.next,confirm:true})
        setPasswordEditor(null);setNotice("已重置「"+current.target.display_name+"」的密码。请通知本人使用新密码登录。")
      }else{
        await api("POST","/api/studio/change-password",{old_password:current.old,new_password:current.next})
        setPasswordEditor(null);pb.authStore.clear();window.location.assign("/login?reason=password-changed")
      }
    }catch(err){setFormError(accountError(err))}finally{mutation.current=false;setBusy(false)}
  }
  const summary=data?.summary,hasFilters=Boolean(query||roleFilter||stateFilter)
  return <SiteShell><main data-studio-fluid-page="staff" className="w-full min-w-0 space-y-6 px-4 pb-12 pt-6 lg:px-8 2xl:px-10">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-semibold text-primary">{accountOnly?"个人设置":"团队管理"}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{accountOnly?"我的账号与安全":"员工与权限"}</h1><p className="mt-2 text-sm text-muted-foreground">{accountOnly?"查看本人的账号资料与登录安全；管理团队成员需要独立的管理员权限。":"把成员资料、访问权限与账号安全分别管理；修改前可核对，保存后有明确反馈。"}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" aria-label={accountOnly?"刷新我的账号":"刷新员工权限列表"} disabled={loading||busy} className={secondary} onClick={()=>void load()}><RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/>刷新</button>{!accountOnly&&me?.role==="admin"&&<button type="button" disabled={busy} onClick={()=>openEditor(null)} className={primary}><Plus className="h-4 w-4"/>添加员工</button>}</div>
    </header>
    {!accountOnly&&me?.role==="admin"&&<section aria-label="团队概况" className="grid gap-3 sm:grid-cols-3">{[{label:"团队成员",value:summary?.total,detail:"已登记的独立账号",icon:UsersRound},{label:"启用账号",value:summary?.active,detail:"可登录并按授权执行任务",icon:UserCheck},{label:"有效管理员",value:summary?.admins,detail:"可编辑成员资料与权限",icon:ShieldCheck}].map(item=><div key={item.label} className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><item.icon className="h-5 w-5"/></span><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{item.value??"—"}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div></div>)}</section>}
    <div role="tablist" aria-label="员工管理工作区" className="flex gap-1 border-b border-border">{(!accountOnly&&me?.role==="admin"?["members","account"]:["account"]).map(value=><button key={value} type="button" role="tab" aria-selected={tab===value} onClick={()=>setTab(value as typeof tab)} className={"min-h-11 border-b-2 px-4 text-sm font-medium "+(tab===value?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground")}>{value==="members"?"成员管理":"我的账号与安全"}</button>)}</div>
    {error&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="h-4 w-4"/><span className="flex-1">{error}</span><button type="button" onClick={()=>void load()} className="font-semibold underline">重新加载</button></div>}
    {notice&&<div role="status" className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary"/><span className="flex-1">{notice}</span><button type="button" aria-label="关闭成功提示" onClick={()=>setNotice("")}><X className="h-4 w-4"/></button></div>}
    {!accountOnly&&tab==="members"&&me?.role==="admin"&&<section aria-label="员工列表" className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid gap-3 border-b border-border p-4 sm:p-5 lg:grid-cols-[minmax(240px,1fr)_180px_180px_auto]">
        <form className="flex min-w-0 items-center gap-2 rounded-xl border border-input bg-background px-3" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search.trim())}}><Search className="h-4 w-4 shrink-0 text-muted-foreground"/><input aria-label="搜索员工姓名或邮箱" value={search} maxLength={180} onChange={e=>setSearch(e.target.value)} placeholder="搜索姓名或邮箱" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"/><button type="submit" disabled={busy} className="text-xs font-semibold text-primary">搜索</button></form>
        <select aria-label="筛选员工角色" className={field} value={roleFilter} disabled={busy} onChange={e=>{setRoleFilter(e.target.value);setPage(1)}}><option value="">全部角色</option><option value="admin">管理员</option><option value="employee">普通员工</option></select>
        <select aria-label="筛选账号状态" className={field} value={stateFilter} disabled={busy} onChange={e=>{setStateFilter(e.target.value);setPage(1)}}><option value="">全部状态</option><option value="true">已启用</option><option value="false">已停用</option></select>
        {hasFilters&&<button type="button" className={secondary} onClick={()=>{setQuery("");setSearch("");setRoleFilter("");setStateFilter("");setPage(1)}}>清除筛选</button>}
      </div>
      <div className="hidden grid-cols-[minmax(220px,1.5fr)_130px_120px_140px_160px] gap-3 bg-secondary/35 px-5 py-3 text-xs font-medium text-muted-foreground xl:grid"><span>成员</span><span>账号角色</span><span>访问状态</span><span>共享权限</span><span className="text-right">操作</span></div>
      {loading?<div role="status" className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>正在读取成员…</div>:!data?.items.length?<div data-workspace-empty className="px-5 py-5"><UsersRound className="h-5 w-5 text-muted-foreground/60"/><h3 className="mt-2 text-sm font-semibold">{hasFilters?"没有找到符合条件的成员":"还没有成员记录"}</h3><p className="mt-2 text-xs text-muted-foreground">{hasFilters?"试试其他关键词，或清除筛选条件。":"添加成员后，可以编辑资料和授予所需权限。"}</p></div>:<ul className="divide-y divide-border">{data.items.map(user=><li key={user.id} className="grid min-w-0 items-center gap-x-3 gap-y-4 px-5 py-5 transition hover:bg-secondary/20 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_130px_120px_140px_160px]">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{Array.from(user.display_name||user.email)[0]?.toUpperCase()}</span><div className="min-w-0"><p className="break-words text-sm font-semibold">{user.display_name}{user.id===me.id&&<span className="ml-2 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">当前账号</span>}</p><p className="mt-1 break-all text-xs text-muted-foreground">{user.email}</p></div></div>
        <span className="w-fit rounded-lg border border-border bg-secondary/30 px-2.5 py-1.5 text-xs">{user.role==="admin"?"管理员":"普通员工"}</span>
        <span className={"inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs "+(user.active?"bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300":"bg-secondary text-muted-foreground")}><span className={"h-1.5 w-1.5 rounded-full "+(user.active?"bg-emerald-500":"bg-muted-foreground")}/>{user.active?"已启用":"已停用"}</span>
        <span className="text-xs text-muted-foreground">{user.share_enabled?"允许共享 Agent":"未开放共享"}</span>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end"><button type="button" aria-label={"编辑 "+user.display_name} disabled={busy} onClick={()=>openEditor(user)} className={secondary}><Pencil className="h-3.5 w-3.5"/>编辑</button><button type="button" aria-label={user.id===me.id?"修改我的密码":"重置 "+user.display_name+" 的密码"} title={user.id===me.id?"修改我的密码":"重置登录密码"} disabled={busy} onClick={()=>openPassword(user.id===me.id?null:user)} className={secondary}><KeyRound className="h-3.5 w-3.5"/><span className="sr-only">密码</span></button></div>
      </li>)}</ul>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground"><span>共 {data?.totalItems??0} 位成员 · 每页 20 位</span><div className="flex items-center gap-3"><button type="button" aria-label="上一页员工" disabled={loading||page<=1} className={secondary} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="h-4 w-4"/>上一页</button><span className="tabular-nums">{data?.page??page} / {data?.totalPages??1}</span><button type="button" aria-label="下一页员工" disabled={loading||page>=(data?.totalPages??1)} className={secondary} onClick={()=>setPage(p=>p+1)}>下一页<ChevronRight className="h-4 w-4"/></button></div></footer>
    </section>}
    {tab==="account"&&me&&<section aria-label="我的账号安全" className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-6"><h2 className="flex items-center gap-2 text-base font-semibold"><UserCheck className="h-5 w-5 text-primary"/>我的资料</h2><dl className="mt-6 space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">姓名</dt><dd className="mt-1 font-medium">{me.display_name}</dd></div><div><dt className="text-xs text-muted-foreground">登录邮箱</dt><dd className="mt-1 flex items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-muted-foreground"/>{me.email}</dd></div><div><dt className="text-xs text-muted-foreground">角色</dt><dd className="mt-1">{me.role==="admin"?"管理员":"普通员工"}</dd></div></dl>{me.role==="admin"&&<button type="button" onClick={()=>openEditor(me)} className={secondary+" mt-6"}><Pencil className="h-4 w-4"/>编辑我的资料</button>}</div><div className="rounded-2xl border border-border bg-card p-6"><h2 className="flex items-center gap-2 text-base font-semibold"><LockKeyhole className="h-5 w-5 text-primary"/>登录安全</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">修改自己的密码时需验证当前密码。保存成功后重新登录，减少旧登录状态继续使用的风险。</p><button type="button" onClick={()=>openPassword(null)} className={primary+" mt-6"}><KeyRound className="h-4 w-4"/>修改登录密码</button><p className="mt-4 text-xs leading-6 text-muted-foreground">不强制最少位数。建议使用独立密码或密码短语，并交由浏览器密码管理器保存。</p></div></section>}
    {loading&&!me&&<p role="status" className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>正在核对账号权限…</p>}
    <Dialog open={!!editor} onOpenChange={open=>{if(!open)void closeEditor()}}><DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-2xl min-w-0 flex-col gap-0 overflow-hidden rounded-2xl p-0" aria-label={editor?.kind==="create"?"添加员工":"编辑员工资料"}>
      <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12"><DialogTitle>{editor?.kind==="create"?"添加团队成员":"编辑成员资料与权限"}</DialogTitle><DialogDescription>修改不会立即生效，检查后点击保存。不会展示或读取成员原密码。</DialogDescription></DialogHeader>
      {editor&&<form onSubmit={saveMember} className="flex min-h-0 flex-1 flex-col"><fieldset disabled={busy} className="min-h-0 space-y-5 overflow-y-auto p-6"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span>员工姓名 *</span><input required maxLength={80} autoComplete="off" className={field} value={editor.display_name} onChange={e=>setEditor({...editor,display_name:e.target.value})} placeholder="填写真实姓名"/></label><label className="space-y-2 text-sm font-medium"><span>工作邮箱 *</span><input required type="email" maxLength={180} autoComplete="off" className={field} value={editor.email} onChange={e=>setEditor({...editor,email:e.target.value})} placeholder="name@company.com"/></label></div>
        {editor.kind==="create"&&<div className="grid gap-4 sm:grid-cols-2"><PasswordField label="初始密码" required name="new-user-password" autoComplete="new-password" advice value={editor.password} onChange={e=>setEditor({...editor,password:e.target.value})}/><PasswordField label="确认初始密码" required name="new-user-password-confirm" autoComplete="new-password" value={editor.confirm} onChange={e=>setEditor({...editor,confirm:e.target.value})}/></div>}
        <label className="block space-y-2 text-sm font-medium"><span>账号角色</span><select aria-label="成员账号角色" className={field} value={editor.role} disabled={editor.original?.id===me?.id} onChange={e=>setEditor({...editor,role:e.target.value as Employee["role"]})}><option value="employee">普通员工 · 按已授予权限使用工作台</option><option value="admin">管理员 · 管理员工、权限和审批</option></select></label>
        <div className="space-y-4 rounded-xl border border-border bg-secondary/25 p-4"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={editor.share_enabled} onChange={e=>setEditor({...editor,share_enabled:e.target.checked})}/><span><strong className="block text-sm font-medium">允许共享 Agent</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">可参与团队共享功能；不自动获得其他成员私有资料或工具权限。</span></span></label>{editor.kind==="edit"&&<label className="flex items-start gap-3"><input type="checkbox" disabled={editor.original?.id===me?.id} className="mt-1 h-4 w-4 accent-primary disabled:opacity-50" checked={editor.active} onChange={e=>setEditor({...editor,active:e.target.checked})}/><span><strong className="block text-sm font-medium">启用账号</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">停用后不能登录；历史记录保留，不会自动删除进行中的任务。</span></span></label>}</div>
        {editor.original?.id===me?.id&&<p className="text-xs leading-5 text-muted-foreground">你正在编辑自己的账号；为避免失去管理入口，不能在这里停用自己或降低自己的角色。</p>}
        {formError&&<p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{formError}</p>}
      </fieldset><footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border bg-card px-6 py-4"><button type="button" disabled={busy} onClick={()=>void closeEditor()} className={secondary}>取消</button><button type="submit" disabled={busy} className={primary}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}{busy?"正在保存…":editor.kind==="create"?"创建成员":"保存修改"}</button></footer></form>}
    </DialogContent></Dialog>
    <Dialog open={!!passwordEditor} onOpenChange={open=>{if(!open)void closePassword()}}><DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-6" aria-label={passwordEditor?.target?"重置成员密码":"修改我的密码"}><DialogHeader><DialogTitle>{passwordEditor?.target?"重置成员密码":"修改我的密码"}</DialogTitle><DialogDescription>{passwordEditor?.target?"正在为「"+passwordEditor.target.display_name+"」设置新密码，旧密码将失效。":"验证当前密码后设置新密码，保存成功后需要重新登录。"}</DialogDescription></DialogHeader>
      {passwordEditor&&<form onSubmit={savePassword} className="space-y-4">{!passwordEditor.target&&<PasswordField label="当前密码" required autoComplete="current-password" value={passwordEditor.old} onChange={e=>setPasswordEditor({...passwordEditor,old:e.target.value})}/>}<PasswordField label="新密码" required autoComplete="new-password" advice value={passwordEditor.next} onChange={e=>setPasswordEditor({...passwordEditor,next:e.target.value})}/><PasswordField label="确认新密码" required autoComplete="new-password" value={passwordEditor.confirm} onChange={e=>setPasswordEditor({...passwordEditor,confirm:e.target.value})}/>{formError&&<p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{formError}</p>}<div className="flex justify-end gap-3 border-t border-border pt-4"><button type="button" disabled={busy} className={secondary} onClick={()=>void closePassword()}>取消</button><button type="submit" disabled={busy} className={primary}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<KeyRound className="h-4 w-4"/>}{busy?"正在保存…":passwordEditor.target?"确认重置":"保存新密码"}</button></div></form>}
    </DialogContent></Dialog>
  </main></SiteShell>
}

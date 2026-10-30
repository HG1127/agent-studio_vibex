import {useEffect,useState,type FormEvent} from "react"
import {useNavigate,useSearchParams} from "react-router-dom"
import {AlertCircle,ArrowRight,Bot,CheckCircle2,KeyRound,Layers3,Loader2,ShieldCheck,Sparkles} from "lucide-react"
import {pb,getPocketBaseUrl,studioAuthStore} from "@/lib/pb"
import {verifyStudioSession} from "@/lib/studioAuth"
import {readLoginPreferences,saveLoginPreferences} from "@/lib/studioAuthStore"
import {passwordInputError,safeLoginReturn} from "@/lib/accountUx"
import {PasswordField} from "@/components/ui/PasswordField"
type SetupStatus={initialized:boolean;can_setup:boolean}
export default function LoginPage(){
  const navigate=useNavigate(),[params]=useSearchParams()
  const afterLogin=safeLoginReturn(params.get("next"))
  const [preferences]=useState(readLoginPreferences)
  const [setup,setSetup]=useState<SetupStatus|null>(null),[statusError,setStatusError]=useState(false),[retry,setRetry]=useState(0)
  const [email,setEmail]=useState(preferences.email),[password,setPassword]=useState(""),[name,setName]=useState(""),[setupKey,setSetupKey]=useState("")
  const [rememberAccount,setRememberAccount]=useState(preferences.rememberAccount),[rememberLogin,setRememberLogin]=useState(preferences.rememberLogin)
  const [error,setError]=useState(""),[busy,setBusy]=useState(false)
  useEffect(()=>{
    let mounted=true
    setStatusError(false)
    if(pb.authStore.isValid)void verifyStudioSession().then(status=>{
      if(!mounted)return
      if(status==="authenticated")navigate(afterLogin,{replace:true})
      else if(status==="unavailable")setStatusError(true)
    })
    void fetch(getPocketBaseUrl()+"/api/studio/bootstrap/status",{signal:AbortSignal.timeout(12000)})
      .then(async r=>{if(!r.ok)throw Error("status_unavailable");return r.json() as Promise<SetupStatus>})
      .then(result=>{if(mounted)setSetup(result)})
      .catch(()=>{if(mounted){setSetup(null);setStatusError(true)}})
    return()=>{mounted=false}
  },[navigate,afterLogin,retry])
  const isSetup=setup?.initialized===false
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(busy||!setup)return
    if(isSetup&&passwordInputError(password)){setError(passwordInputError(password));return}
    setBusy(true);setError("")
    try{
      if(isSetup){
        const response=await fetch(getPocketBaseUrl()+"/api/studio/bootstrap",{
          method:"POST",headers:{"Content-Type":"application/json","X-Agent-Studio-Setup-Key":setupKey},
          body:JSON.stringify({email:email.trim(),password,display_name:name.trim()}),signal:AbortSignal.timeout(15000),
        })
        if(!response.ok)throw Error("初始化失败，请核对初始化密钥、邮箱或账号是否已经建立。")
        setSetup({initialized:true,can_setup:false});setSetupKey("")
      }
      studioAuthStore.setPersistence(rememberLogin)
      await pb.collection("studio_users").authWithPassword(email.trim(),password,{requestKey:null})
      saveLoginPreferences(email,rememberAccount,rememberLogin)
      setPassword("")
      navigate(afterLogin,{replace:true})
    }catch(err){
      const status=typeof err==="object"&&err!==null&&"status" in err?Number(err.status):0
      setError(err instanceof Error&&err.message.startsWith("初始化失败")?err.message:
        status===429?"尝试过于频繁，请稍后再试。":status===0?"无法完成登录，请检查网络或账号服务后重试。":"登录失败，请检查邮箱、密码或账号是否被停用。")
    }finally{setBusy(false)}
  }
  return <main className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[minmax(340px,0.9fr)_minmax(470px,1.1fr)]">
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-10 text-white lg:flex xl:p-14">
      <div className="absolute -right-24 top-12 h-96 w-96 rounded-full bg-blue-600/15 blur-3xl" aria-hidden/>
      <div className="relative flex items-center gap-3 text-lg font-semibold"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><Bot className="h-6 w-6"/></span>Agent Studio</div>
      <div className="relative max-w-md py-14"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">YOUR TEAM. YOUR AGENTS.</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">让想法成为<br/>可执行的团队能力</h1>
        <p className="mt-5 text-base leading-8 text-slate-300">从明确目标到角色协作，在同一个工作台完成资源连接、任务执行与结果验收。</p>
        <div className="mt-9 space-y-5">{[{icon:Sparkles,title:"设计与协作",text:"把目标拆解为可复用的 Agent 方案"},{icon:Layers3,title:"连接与执行",text:"在明确授权范围内使用模型和工具"},{icon:ShieldCheck,title:"结果与治理",text:"保留执行证据，让关键判断回到人手中"}].map(item=><div key={item.title} className="flex gap-3"><item.icon className="mt-1 h-5 w-5 shrink-0 text-blue-300"/><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-sm text-slate-400">{item.text}</p></div></div>)}</div>
      </div>
      <p className="relative text-xs text-slate-400">独立账号 · 明确授权 · 人工确认</p>
    </aside>
    <section className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-7 flex items-center gap-2 text-base font-semibold lg:hidden"><Bot className="h-6 w-6 text-primary"/>Agent Studio</div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{isSetup?"首次设置":"欢迎回来"}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">{isSetup?"建立你的工作台":"登录工作台"}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{isSetup?"建立首位管理员后，由管理员添加团队成员。":"使用工作邮箱继续设计 Agent、处理任务与查看结果。"}</p>
        {params.get("reason")==="password-changed"&&<p role="status" className="mt-5 flex gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary"/>密码已更新，请使用新密码重新登录。</p>}
        {!setup&&(statusError?<div role="alert" className="mt-5 rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-800">账号服务暂时无法连接。<button type="button" onClick={()=>setRetry(v=>v+1)} className="ml-2 font-semibold underline">重新连接</button></div>:<p role="status" className="mt-5 text-sm text-muted-foreground">正在连接账号服务…</p>)}
        <form onSubmit={submit} autoComplete="on" className="mt-8 space-y-5" aria-label={isSetup?"初始化管理员":"登录账号"}>
          {isSetup&&<label className="block text-sm font-medium">管理员姓名<input name="display_name" required maxLength={80} value={name} onChange={e=>setName(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder="填写管理员姓名"/></label>}
          <label htmlFor="login-email" className="block text-sm font-medium">工作邮箱<input id="login-email" name="username" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={180} value={email} onChange={e=>{setEmail(e.target.value);setError("")}} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" placeholder="name@company.com"/></label>
          <PasswordField id="login-password" name="password" label="密码" required value={password} autoComplete={isSetup?"new-password":"current-password"} placeholder={isSetup?"设置管理员密码":"输入登录密码"} advice={isSetup} onChange={e=>{setPassword(e.target.value);setError("")}}/>
          {isSetup&&<PasswordField name="setup-key" label="服务器初始化密钥" value={setupKey} required autoComplete="off" maxLength={256} onChange={e=>setSetupKey(e.target.value)} hint="由部署人员提供，建立管理员后不再使用。"/>}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-muted-foreground">
            <label className="flex min-h-9 cursor-pointer items-center gap-2"><input type="checkbox" checked={rememberAccount} onChange={e=>setRememberAccount(e.target.checked)} className="h-4 w-4 accent-primary"/>记住账号</label>
            <label className="flex min-h-9 cursor-pointer items-center gap-2"><input type="checkbox" checked={rememberLogin} onChange={e=>setRememberLogin(e.target.checked)} className="h-4 w-4 accent-primary"/>保持登录（仅私人设备）</label>
          </div>
          {error&&<p role="alert" className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</p>}
          <button type="submit" disabled={busy||!setup||(isSetup&&!setup.can_setup)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowRight className="h-4 w-4"/>}{busy?"正在验证…":isSetup?"创建管理员并登录":"登录"}</button>
        </form>
        <details className="mt-5 rounded-xl border border-border bg-card p-3 text-xs leading-6 text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">记住密码与自动填充</summary><p className="mt-2">登录时可使用浏览器密码管理器保存并自动填充密码；是否弹出保存提示取决于浏览器设置。本系统不在网页存储中保存密码。未勾选“保持登录”时，只在当前标签保存登录状态，新标签可能需要重新登录。私人设备可勾选以便跨标签工作；共享电脑请勿勾选，使用完毕后主动退出。</p></details>
        <details className="mt-3 text-xs leading-6 text-muted-foreground"><summary className="cursor-pointer">忘记密码或无法登录？</summary><p className="mt-2">请联系公司管理员核对邮箱、账号状态或重置密码。系统不会向未验证邮箱发送密码。</p></details>
        {isSetup&&!setup.can_setup&&<p role="alert" className="mt-4 text-sm text-amber-700">初始化密钥未配置，请联系部署人员。</p>}
        <p className="mt-7 flex items-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground"><KeyRound className="h-3.5 w-3.5"/>账号权限由公司管理员管理</p>
      </div>
    </section>
  </main>
}

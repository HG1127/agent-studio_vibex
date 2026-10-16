import { useEffect, useState, type FormEvent } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { AlertCircle, ArrowRight, Bot, KeyRound, LockKeyhole, Loader2, ShieldCheck } from "lucide-react"
import { pb, getPocketBaseUrl } from "@/lib/pb"
import { verifyStudioSession } from "@/lib/studioAuth"

type SetupStatus = {initialized: boolean; can_setup: boolean}

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requestedPath = params.get("next") || ""
  const afterLogin = requestedPath.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath : "/"
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [statusError, setStatusError] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [setupKey, setSetupKey] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let mounted = true
    // Reuse the exact same single-flight account verification as AuthGate.
    // Aborted / transient requests must never clear an otherwise valid JWT.
    if (pb.authStore.isValid) {
      void verifyStudioSession().then(status => {
        if (!mounted) return
        if (status === "authenticated") navigate(afterLogin, {replace:true})
        else if (status === "unavailable") setStatusError(true)
      })
    }
    void fetch(getPocketBaseUrl() + "/api/studio/bootstrap/status")
      .then(async r => {
        if (!r.ok) throw new Error("studio_status_unavailable")
        return await r.json() as SetupStatus
      })
      .then(result => { if (mounted) setSetup(result) })
      .catch(() => { if (mounted) {setSetup(null);setStatusError(true)} })
    return () => { mounted = false }
  }, [navigate, afterLogin])
  const submit = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if(busy)return
    setBusy(true);setError("")
    try {
      if(setup && !setup.initialized){
        const response=await fetch(getPocketBaseUrl() + "/api/studio/bootstrap",{
          method:"POST",
          headers:{"Content-Type":"application/json","X-Agent-Studio-Setup-Key":setupKey},
          body:JSON.stringify({email,password,display_name:name}),
        })
        if(!response.ok) {
          const data=await response.json().catch(() => ({})) as {error?:string}
          throw new Error(data.error==="already_initialized"?"已经有管理员账号，请返回登录。":"初始化失败，请核对初始化密钥、邮箱和密码。")
        }
        setSetup({initialized:true,can_setup:false})
      }
      await pb.collection("studio_users").authWithPassword(email.trim(),password)
      navigate(afterLogin,{replace:true})
    } catch(err) {
      setError((err as Error).message.includes("初始化失败") || (err as Error).message.includes("已经有") ? (err as Error).message : "登录失败，请检查邮箱、密码或账号是否已被停用。")
    } finally {setBusy(false)}
  }
  const isSetup=setup?.initialized === false
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-12 text-slate-900 sm:py-24">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white shadow-lg"><Bot size={27}/></div>
          <h1 className="text-3xl font-semibold tracking-tight">Agent Studio</h1>
          <p className="mt-2 text-sm text-slate-500">企业内部 AI Agent 工作台 · 独立账号登录</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
            {isSetup ? <ShieldCheck className="text-slate-700" size={21}/> : <LockKeyhole className="text-slate-700" size={21}/>}
            {isSetup ? "首次初始化管理员" : "登录工作台"}
          </div>
          {setup === null && (statusError
            ? <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p>账号服务暂时无法连接。请确认独立后端已启动，并检查网络或反向代理配置。</p>
                <button type="button" onClick={() => window.location.reload()}
                  className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 font-medium hover:bg-amber-100">重新连接</button>
              </div>
            : <p className="mb-4 text-sm text-slate-500" role="status">正在连接独立账号服务…</p>)}
          {isSetup && <p className="mb-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">首次启用需要配置服务器初始化密钥。完成后员工账号由管理员统一创建，禁止开放自助注册。</p>}
          <form onSubmit={submit} className="space-y-4">
            {isSetup && <label className="block text-sm font-medium">管理员姓名
              <input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-slate-500" placeholder="例如：系统管理员"/>
            </label>}
            <label className="block text-sm font-medium">工作邮箱
              <input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-slate-500" placeholder="name@company.com"/>
            </label>
            <label className="block text-sm font-medium">密码
              <input type="password" minLength={isSetup?12:1} autoComplete={isSetup?"new-password":"current-password"} required
                value={password} onChange={e=>setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-slate-500" placeholder={isSetup?"至少 12 位":"请输入登录密码"}/>
            </label>
            {isSetup && <label className="block text-sm font-medium">服务器初始化密钥
              <input type="password" autoComplete="off" value={setupKey} onChange={e=>setSetupKey(e.target.value)} required
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-slate-500" placeholder="与服务器环境变量一致"/>
            </label>}
            {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={16}/>{error}</p>}
            <button type="submit" disabled={busy || !setup || (isSetup && !setup.can_setup)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
              {busy ? <Loader2 className="animate-spin" size={18}/> : <ArrowRight size={18}/>}
              {isSetup ? "创建管理员并登录" : "登录"}
            </button>
          </form>
          {isSetup && !setup.can_setup && <p role="alert" className="mt-3 text-sm text-amber-700">尚未在后端配置初始化密钥，请由部署人员完成配置后刷新。</p>}
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><KeyRound size={14}/>独立账号验证 · 员工权限隔离 · 不使用第三方平台登录</div>
      </div>
    </main>
  )
}

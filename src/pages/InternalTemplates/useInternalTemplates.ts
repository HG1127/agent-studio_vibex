import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent} from 'react'
import {getPocketBaseUrl} from '@/lib/pb'
import {vibexAuthHeaders,verifyStudioSession,getStudioAccountInfo} from '@/lib/studioAuth'
import {createPgNativePilotApi} from '@/lib/pgNativePilotApi'
import {createPgNativeInternalShareApi,PgNativeInternalShareError} from '@/lib/pgNativeInternalShare'
import {createOriginalInternalTemplatesController,emptyOriginalInternalTemplatesView,type OriginalInternalTemplatesController,type OwnSpec,type Invite,type Preview,type Created,type Redeemed} from '@/lib/originalInternalTemplates'
type OwnResponse={specs:OwnSpec[];invites:Invite[];scope:string}
function explainError(code: string): string {
  const known: Record<string, string> = {
    rh_login_required: "请先登录，再使用内部协作功能",
    internal_sharing_not_configured: "旧版共享白名单未配置。独立模式请联系管理员检查账号权限。",
    internal_member_required: "当前账号的 Agent 共享权限未开启。请联系管理员在「员工与权限」中开启。",
    spec_not_found: "此 Agent 不属于你，或已经被删除。",
    share_invite_limit: "待领取分享码已达到上限，请撤销不需要的分享。",
    template_review_required: "方案内容已变化，或尚未完成审核。请重新预览并确认。",
    share_code_unavailable: "分享码无效、已使用、已过期，或已经撤销。",
    source_spec_invalid: "源 Agent 方案格式无效，请返回工作台检查并保存。",
    internal_templates_list_failed: "内部分享列表获取失败。",
    internal_template_action_failed: "分享操作暂时失败，请稍后重试。",
  }
  return known[code] || "请求失败，请检查网络或联系管理员。"
}

async function requestInternal<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
  const response = await fetch(getPocketBaseUrl() + "/api/internal/templates", {
    method,
    headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const error = new Error(explainError(String(result.error || "")))
    if (response.status === 401) error.name = "LoginRequired"
    throw error
  }
  return result as T
}


function useLegacyInternalTemplates(){
  const [ownSpecs, setOwnSpecs] = useState<OwnSpec[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [code, setCode] = useState("")
  const [redeemed, setRedeemed] = useState<Redeemed | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loginRequired, setLoginRequired] = useState(false)
  const [checkedAt, setCheckedAt] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    const response = await requestInternal<OwnResponse>("GET")
    setOwnSpecs(response.specs || [])
    setInvites(response.invites || [])
    setCheckedAt(Date.now())
    setSelectedId(current => response.specs?.some(spec => spec.id === current)
      ? current : response.specs?.[0]?.id || "")
  }, [])

  useEffect(() => {
    let active = true
    requestInternal<OwnResponse>("GET").then(value => {
      if (!active) return
      setOwnSpecs(value.specs || [])
      setInvites(value.invites || [])
      setCheckedAt(Date.now())
      setSelectedId(value.specs?.[0]?.id || "")
    }).catch(err => {
      if (!active) return
      setError((err as Error).message)
      setLoginRequired((err as Error).name === "LoginRequired")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const handleRefresh = async () => {
    if (busy) return
    setBusy(true); setError(""); setNotice("")
    try { await refresh() }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const handlePreview = async () => {
    if (!selectedId || busy) return
    setBusy(true); setError(""); setNotice(""); setCreated(null); setReviewed(false); setPreview(null)
    try {
      const result=await requestInternal<Preview>("POST",{action:"preview",spec_id:selectedId})
      setPreview(result)
    } catch(err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const handleCreate = async () => {
    if (!preview || !reviewed || busy) return
    setBusy(true); setError(""); setNotice("")
    try {
      const result=await requestInternal<Created>("POST",{
        action:"create",spec_id:selectedId,
        preview_hash:preview.preview_hash,confirm_safe:true,
      })
      setCreated(result); setPreview(null); setReviewed(false)
      await refresh()
      setNotice("分享码已生成，仅在此处显示。发送给已获授权的同事即可。")
    } catch(err) {
      setReviewed(false)
      setError((err as Error).message)
    } finally { setBusy(false) }
  }
  const handleRedeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true); setRedeemed(null); setError(""); setNotice("")
    try {
      const result=await requestInternal<Redeemed>("POST",{
        action:"redeem",share_code:code.trim(),
      })
      setRedeemed(result)
      setCode("")
      await refresh()
      setNotice("Agent 已复制到你的工作台，请使用自己的模型与知识库连接并试运行。")
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const handleRevoke = async (id: string) => {
    if (busy) return
    setBusy(true); setError(""); setNotice("")
    try {
      await requestInternal("POST",{action:"revoke",id})
      if (created?.id === id) setCreated(null)
      await refresh()
      setNotice("分享码已撤销，未领取的同事将无法再使用。")
    } catch(err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const handleCopy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.share_code)
      setNotice("分享码已复制。请通过公司的授权沟通渠道发送，不要发到公开群组。")
    } catch { setError("剪贴板复制失败，请手动复制显示的分享码。") }
  }


  return {ownSpecs,invites,selectedId,preview,reviewed,created,code,redeemed,notice,error,loading,busy,loginRequired,checkedAt,setSelectedId,setPreview,setReviewed,setCreated,setError,setCode,setRedeemed,handleRefresh,handlePreview,handleCreate,handleRedeem,handleRevoke,handleCopy,listReady:!loading&&!error,writeDisabled:busy||loading||loginRequired}
}

function usePgInternalTemplates(){
 const [view,setView]=useState(emptyOriginalInternalTemplatesView)
 const owned=useRef<OriginalInternalTemplatesController|null>(null)
 useLayoutEffect(()=>{owned.current?.reconcile()})
 useEffect(()=>{
  const account=createPgNativePilotApi(),api=createPgNativeInternalShareApi()
  const controller=createOriginalInternalTemplatesController({api,
   currentEmployee:()=>getStudioAccountInfo()?.id??null,
   verifyEmployee:async()=>{const status=await verifyStudioSession();if(status!=='authenticated')throw new PgNativeInternalShareError(status==='signed_out'?401:503,'original_internal_share_identity_unavailable',status==='signed_out');const profile=getStudioAccountInfo();if(!profile?.active)throw new PgNativeInternalShareError(401,'session_required',true);return profile.id},
   capabilities:()=>account.getConfigCapabilities(),copyText:value=>navigator.clipboard.writeText(value),
   onChange:value=>{if(owned.current===controller)setView(value)},
  })
  owned.current=controller;setView(controller.getView());void controller.start()
  const check=()=>{controller.reconcile();void controller.start()},visible=()=>{if(document.visibilityState==='visible')check()}
  window.addEventListener('focus',check);window.addEventListener('pageshow',check);window.addEventListener('storage',check);document.addEventListener('visibilitychange',visible)
  return()=>{window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);window.removeEventListener('storage',check);document.removeEventListener('visibilitychange',visible);if(owned.current===controller)owned.current=null;controller.dispose()}
 },[])
 const call=<K extends Exclude<keyof OriginalInternalTemplatesController,'getView'|'dispose'|'start'|'reconcile'>>(key:K,...args:Parameters<OriginalInternalTemplatesController[K]>)=>{
  const active=owned.current
  if(!active)return
  const method=active[key] as (...values:Parameters<OriginalInternalTemplatesController[K]>)=>unknown
  return method(...args)
 }
 return {...view,
  setSelectedId:(value:string)=>call('setSelectedId',value),setPreview:(value:null)=>call('setPreview',value),setReviewed:(value:boolean)=>call('setReviewed',value),
  setCreated:(value:null)=>call('setCreated',value),setError:(value:string)=>call('setError',value),setCode:(value:string)=>call('setCode',value),setRedeemed:(value:null)=>call('setRedeemed',value),
  handleRefresh:()=>call('handleRefresh'),handlePreview:()=>call('handlePreview'),handleCreate:()=>call('handleCreate'),
  handleRedeem:(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();return call('handleRedeem')},handleRevoke:(id:string)=>call('handleRevoke',id),handleCopy:()=>call('handleCopy'),
 }
}
// Build-time selection invokes exactly one original-page business hook. PB stays
// recoverable, while the PG branch never calls getPocketBaseUrl or PB headers.
const useSelectedInternalTemplates=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?usePgInternalTemplates:useLegacyInternalTemplates
export function useInternalTemplates(){return useSelectedInternalTemplates()}

import {useEffect,useState} from "react"
import {AlertTriangle,HelpCircle,Info,ShieldAlert} from "lucide-react"
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog"
import {
  respondToStudioDialog,subscribeStudioDialogs,
  type StudioDialogRequest,
} from "@/lib/studioDialogs"

function presentation(request:StudioDialogRequest){
  const {message,options}=request
  const unsaved=/未保存|暂存失败|舍弃|丢失修改|离开页面/.test(message)
  const destructive=options.destructive===true ||
    /永久删除|删除知识库|删除文档|清除.*向量|撤销.*权限|停用员工/.test(message)
  return {
    unsaved,destructive,
    title:options.title||(unsaved?"当前修改尚未保存":destructive?"请确认可能影响数据或权限的操作":
      request.mode==="notice"?"操作提示":request.mode==="input"?"请输入信息":"请确认本次操作"),
    cancel:options.cancelLabel||(unsaved?"继续编辑":"取消"),
    confirm:options.confirmLabel||(request.mode==="notice"?"知道了":unsaved?"放弃修改并离开":
      destructive?"确认操作":"确认继续"),
  }
}

export function StudioDialogHost(){
  const [current,setCurrent]=useState<StudioDialogRequest|null>(null)
  const [input,setInput]=useState("")
  useEffect(()=>subscribeStudioDialogs(request=>{
    setCurrent(request)
    setInput("")
  }),[])
  if(!current)return null
  const info=presentation(current)
  const Icon=info.destructive?AlertTriangle:info.unsaved?ShieldAlert:
    current.mode==="notice"?Info:HelpCircle
  const dismiss=()=>respondToStudioDialog(current.id,current.mode==="input"?null:false)
  const accept=()=>respondToStudioDialog(current.id,
    current.mode==="input"?input:current.mode==="notice"?true:true)
  return <Dialog open onOpenChange={open=>{if(!open)dismiss()}}>
    <DialogContent data-studio-dialog="true" aria-label={info.title} overlayClassName="z-[210] bg-black/55 backdrop-blur-[2px]" className="z-[220] w-[calc(100vw-2rem)] max-w-md rounded-2xl border-border bg-card p-0 shadow-2xl sm:max-w-lg"
      onPointerDownOutside={event=>event.preventDefault()}>
      <div className="flex items-start gap-3 px-5 pt-5 sm:px-6">
        <span className={"mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl "+
          (info.destructive?"bg-destructive/10 text-destructive":"bg-primary/10 text-primary")}>
          <Icon className="h-5 w-5"/>
        </span>
        <DialogHeader className="min-w-0 flex-1 space-y-2 text-left">
          <DialogTitle className="text-base font-semibold leading-6 text-foreground">{info.title}</DialogTitle>
          <DialogDescription className="max-h-[46dvh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground/85">
            {current.message}
          </DialogDescription>
        </DialogHeader>
      </div>
      {current.mode==="input"&&<div className="px-5 sm:px-6">
        <input aria-label="提示输入" autoFocus maxLength={500}
          value={input} onChange={event=>setInput(event.target.value)}
          placeholder={current.options.placeholder||"请输入内容"}
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"/>
      </div>}
      <DialogFooter className="flex flex-row items-center justify-end gap-2 rounded-b-2xl border-t border-border bg-secondary/30 px-5 py-4 sm:px-6">
        {current.mode!=="notice"&&<button type="button" autoFocus={current.mode==="confirm"} onClick={dismiss}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {info.cancel}
        </button>}
        <button type="button" autoFocus={current.mode==="notice"} onClick={accept}
          className={"inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary "+
            (info.destructive?"bg-destructive text-destructive-foreground hover:bg-destructive/90":
              "bg-primary text-primary-foreground hover:bg-primary/90")}>
          {info.confirm}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

import type { ReactNode } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

type Props={
  open:boolean
  onClose:()=>void
  title?:string
  description?:string
  children:ReactNode
}
export function AgentDraftDrawer({open,onClose,title,description,children}:Props){
  return <Dialog open={open} onOpenChange={value=>{if(!value)onClose()}}>
    <DialogContent aria-label={title||"随时调整 Agent 方案"}
      className="flex h-[min(94dvh,1000px)] w-[calc(100vw-1rem)] max-w-[min(96vw,1000px)] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:w-[min(96vw,1000px)]">
      <DialogHeader className="shrink-0 border-b border-border bg-card px-4 py-4 pr-12 sm:px-6">
        <DialogTitle>{title||"随时调整 Agent 方案"}</DialogTitle>
        <DialogDescription>
          {description||"直接修改当前方案、保存版本。已在运行中的任务继续使用启动时的配置快照，变更只影响下一次试跑。"}
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-5">
        {children}
      </div>
    </DialogContent>
  </Dialog>
}

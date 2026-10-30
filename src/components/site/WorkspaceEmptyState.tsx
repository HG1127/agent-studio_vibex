import type {ReactNode} from 'react'
import type {LucideIcon} from 'lucide-react'
/** Inline workspace state: it must never displace the list or become a marketing hero. */
export function WorkspaceEmptyState({icon:Icon,title,description,actions}:{icon?:LucideIcon;title:string;description?:string;actions?:ReactNode}){
 return <div data-workspace-empty className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-5 sm:px-5">
  {Icon&&<Icon aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground"/>}
  <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-foreground">{title}</h2>{description&&<p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}</div>
  {actions&&<div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
 </div>
}

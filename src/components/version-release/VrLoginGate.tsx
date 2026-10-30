import {GitBranch,LogIn} from 'lucide-react'
import {WorkspaceEmptyState} from '@/components/site/WorkspaceEmptyState'
export function VrLoginGate({onLoginClick}:{onLoginClick:()=>void}){
 return <WorkspaceEmptyState icon={GitBranch} title="登录后管理助手的版本与发布" description="版本、验收记录和发布状态按账号隔离。" actions={<button type="button" onClick={onLoginClick} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"><LogIn className="h-4 w-4"/>立即登录</button>}/>
}

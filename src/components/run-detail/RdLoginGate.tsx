import {LogIn,ScrollText} from 'lucide-react'
import {WorkspaceEmptyState} from '@/components/site/WorkspaceEmptyState'
export function RdLoginGate({onLoginClick}:{onLoginClick:()=>void}){
 return <WorkspaceEmptyState icon={ScrollText} title="登录后查看运行记录" description="仅显示当前账号的任务、结果和运行详情。" actions={<button type="button" onClick={onLoginClick} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"><LogIn className="h-4 w-4"/>立即登录</button>}/>
}

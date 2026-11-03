import {Link} from 'react-router-dom'
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog'
import {getStudioAccountInfo} from '@/lib/studioAuth'
import {useDesktopComputer} from '@/components/tool-hub/DesktopComputerContext'

const button='inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-secondary disabled:opacity-40'
export function StudioSettingsDialog({open,onOpenChange,desktop,busy,error,openNative}:{open:boolean;onOpenChange:(open:boolean)=>void;desktop:boolean;busy:boolean;error:string;openNative:(action:'settings'|'updates')=>Promise<void>}){
 const account=getStudioAccountInfo(),computer=useDesktopComputer()
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
  <DialogHeader><DialogTitle>设置</DialogTitle><DialogDescription>管理账号、电脑连接与桌面应用。</DialogDescription></DialogHeader>
  <section aria-label="账号设置" className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">账号</h3><div className="text-sm"><p>{account?.display_name||'我的账号'}</p><p className="mt-1 break-all text-muted-foreground">{account?.email}</p></div><Link className={button} to="/account" onClick={()=>onOpenChange(false)}>我的账号与安全</Link></section>
  {desktop&&<>
   <section aria-label="电脑连接设置" className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">电脑连接</h3><p className="text-sm text-muted-foreground">选择电脑、查看连接状态，管理文件、网站和应用授权。</p><Link className={button} to="/tool-hub?view=devices" onClick={()=>onOpenChange(false)}>管理电脑与授权</Link></section>
   <section aria-label="桌面应用设置" className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">桌面应用</h3><p className="text-sm text-muted-foreground">{computer?.state?.appVersion?'当前版本 '+computer.state.appVersion:'正在读取当前版本'}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={()=>void openNative('updates')}>检查更新</button><button type="button" className={button} disabled={busy} onClick={()=>void openNative('settings')}>服务器设置</button></div><p className="text-xs leading-6 text-muted-foreground">更新窗口中可查看新版本、下载并确认重启安装。</p></section>
  </>}
  {error&&<p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
 </DialogContent></Dialog>
}

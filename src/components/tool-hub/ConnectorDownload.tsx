import {Download,RefreshCw,ShieldCheck} from 'lucide-react'
import {useConnectorRelease} from '@/lib/useConnectorRelease'
export function ConnectorDownload({purpose='install'}:{purpose?:'install'|'update'}){
 const download=useConnectorRelease(),current=download.loading?null:download
 const loopback=['127.0.0.1','localhost','[::1]'].includes(window.location.hostname)
 return <section aria-label="独立电脑连接器下载" className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
  <h3 className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-primary"/>{purpose==='update'?'更新本机连接器，保留已有绑定':'首次使用：先准备连接器，不需要开发环境'}</h3>
  <p className="mt-2 text-xs leading-6 text-muted-foreground">Windows x64：下载完整便携包 → 解压 → 双击 Start-Connector.cmd。内置运行环境，无需安装 Node.js、pnpm、Git 或项目源码；本机仍需 Google Chrome。</p>
  {!current?<p role="status" className="mt-3 text-xs text-muted-foreground">正在检查可下载版本…</p>:current.release?<div className="mt-3 space-y-2">
   <a href={current.release.url} download className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Download className="h-4 w-4"/>下载 Windows 连接器 · {(current.release.bytes/1024/1024).toFixed(1)} MB</a>
   <p className="text-xs text-muted-foreground">版本 {current.release.version} · {current.release.codeSigned?'发布清单标记已签名，请由公司IT核验签名':'预览便携包，尚未代码签名；请遵守公司IT审批，不绕过系统安全拦截。'}</p>
   <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">查看文件校验值</summary><code className="mt-1 block break-all">SHA-256 {current.release.sha256}</code><p>校验值用于核对完整性，不等同于发行者数字签名。</p></details>
  </div>:<div className="mt-3"><p role="status" className="text-xs text-muted-foreground">{current.error}</p><button type="button" onClick={download.refresh} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary"><RefreshCw className="h-3 w-3"/>重新检查下载</button></div>}
  {loopback&&<p className="mt-3 rounded-lg border border-border bg-card p-2 text-xs leading-5 text-muted-foreground">当前是本机预览。其他同事须从可访问的公司 HTTPS 工作台登录并生成各自连接文件；不能共用当前 localhost 地址或你的设备凭据。</p>}
  <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>{purpose==='update'?'先结束待处理任务并正常退出旧连接器，从新目录启动并恢复原连接。无需重新生成 JSON 或重新配对；网页刷新不会替换运行中的旧进程。':'先打开本机管理窗口，再生成连接文件。共用安装包，不共用账号、配对文件或设备凭据。'}</p>
 </section>
}

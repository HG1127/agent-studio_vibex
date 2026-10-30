import {useState} from 'react'
import {Copy,FolderOpen} from 'lucide-react'
import {localConnectorLocation} from '@/lib/localConnectorLocation'
import {ConnectorDownload} from './ConnectorDownload'
declare const __STUDIO_LOCAL_CONNECTOR_DIRECTORY__:string
export function LocalConnectorEntry({showDownload=true}:{showDownload?:boolean}={}){
  const [notice,setNotice]=useState('')
  const directory=typeof __STUDIO_LOCAL_CONNECTOR_DIRECTORY__==='string'?__STUDIO_LOCAL_CONNECTOR_DIRECTORY__:''
  const local=localConnectorLocation(directory,window.location.hostname,import.meta.env.DEV)
  const copy=async(text:string,label:string)=>{try{await navigator.clipboard.writeText(text);setNotice(label)}catch{setNotice('复制不可用，请手动选中并复制。')}}
  return <div className="space-y-3">{showDownload&&<ConnectorDownload/>}<details><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">开发者：使用已有项目启动器</summary><section aria-label="找到本机连接启动文件" className="min-w-0 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-6">
    <p className="flex items-center gap-2 font-semibold text-foreground"><FolderOpen className="h-4 w-4 shrink-0 text-primary"/>打开与本页同版本的连接组件</p>
    {local?<><p>这是当前本机开发预览的准确目录。复制到文件资源管理器地址栏，再双击 <strong>start-connect.cmd</strong>。</p>
      <input aria-label="当前预览连接器完整目录" readOnly value={local.directory} className="min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-xs" onFocus={e=>e.target.select()}/>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void copy(local.directory,'启动目录已复制，请粘贴到文件资源管理器地址栏。')} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 font-semibold text-primary"><Copy className="h-3.5 w-3.5"/>复制准确目录</button><button type="button" onClick={()=>void copy(local.command,'启动命令已复制，仅在本机 PowerShell 中执行。')} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-muted-foreground">复制 PowerShell 启动命令</button></div></>:
      <p>在安装的完整同版本项目中打开 <code>local-executor/start-connect.cmd</code>。文件不存在说明目录或版本不一致；请更新完整组件，不要只把一个 cmd 复制进旧目录。</p>}
    <p className="text-muted-foreground">普通项目目录与 .worktrees 下的开发分支不是同一份文件。此入口仍需本机 Node.js 24 和项目依赖；不会自动安装、提权或开启后台服务。</p>
    {notice&&<p role="status" className="text-primary">{notice}</p>}
  </section></details></div>
}

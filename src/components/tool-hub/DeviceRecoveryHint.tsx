import {RefreshCw} from 'lucide-react'
import type {LocalDevice} from '@/lib/localDevices'
import {deviceConnectionGuidance} from '@/lib/localDeviceInventory'
import {ConnectComputerButton} from './ConnectComputerButton'
import {LocalConnectorEntry} from './LocalConnectorEntry'

export function DeviceRecoveryHint({device,onRefresh,now}:{device:LocalDevice;onRefresh:()=>void;now:number}){
  const guidance=deviceConnectionGuidance(device,now)
  if(guidance.phase==='online')return null
  if(guidance.phase==='revoked')return <p className="mt-2 rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">此设备已撤销，不能恢复原授权。确需使用时，请重新连接并确认范围。</p>
  return <section aria-label="恢复已有设备连接" className="mt-3 min-w-0 space-y-3 rounded-xl border border-border bg-secondary/25 p-4 text-xs">
    <p className="font-semibold text-foreground">{guidance.canResume?(device.seen_ms>0?'设备离线，恢复原连接即可':'配对已完成，尚未收到本机心跳'):guidance.phase==='expired'?'这条连接文件已过期，继续原登记即可':guidance.phase==='pairing'?'还没有完成本机配对':'尚未核实本机配对状态'}</p>
    <p className="leading-6 text-muted-foreground">{guidance.canResume?'账号与设备已绑定，不需要重新生成连接文件。若连接器已运行，请点“我已启动，重新检查”；若未运行，在原电脑启动 Start-Connector.cmd。只有一条已保存连接且服务器确认在线时才会后台恢复；多条连接或恢复未确认时会打开本机管理窗口。不要重复配对。':guidance.canContinue?'打开下面的向导，重新确认用途后更新同一设备的连接文件。不会新增同名记录，旧的未使用文件会失效；文件有效期内在本机完成确认。':'旧版服务只提供心跳，不能据此判断配对是否完成。先核查原终端：已有本机连接时使用原启动方式；不要仅因缺少心跳而新建配对。'}</p>
    {guidance.canContinue&&<ConnectComputerButton continueDevice={device} label="继续此设备的连接" onConnected={()=>onRefresh()}/>}
    {guidance.canResume&&<div className="space-y-2 leading-6"><strong className="text-foreground">推荐：启动连接器，在后台恢复已有连接</strong><LocalConnectorEntry/><p>在原电脑双击 Start-Connector.cmd。若只有一条已保存连接且服务器确认在线，连接器会在后台恢复，不弹出独立管理窗口；多条连接、恢复失败或首次配对时才打开本机设置。需要主动打开管理界面时，双击 Manage-Connector.cmd。日常文件、浏览器和授权调整都在工作台内完成。</p></div>}

    <button type="button" onClick={onRefresh} className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary"><RefreshCw className="h-3.5 w-3.5"/>我已启动，重新检查</button>

  </section>
}

import type {LocalDevice} from './localDevices'

export const setupProgressStages={
  imported:['本机已导入连接文件，等待确认范围','请在本机核对账号、网站和文件范围，然后由本人确认。'],
  choosing_folder:['本机正在选择工作文件夹','请在本机系统窗口选择目录；也可在连接器中取消本次选择。'],
  choosing_file:['本机正在选择文件','请在本机系统窗口选择文件；也可在连接器中取消本次选择。'],
  ready_to_confirm:['本机已选好范围，等待本人确认','请核对本机显示的范围，再勾选本人确认并点击“确认连接并启动”。'],
  confirming:['本机已提交确认，正在核实配对结果','正在等待服务器的配对结果；之后还需收到真实心跳与能力清单。'],
  selection_cancelled:['本机已取消本次选择，等待确认范围','原有草稿保留；可以重新选择，或核对当前范围后由本人确认。'],
  cancelled:['本机已取消本次连接准备','这条设备登记仍保留，可在有效期内重新导入；过期后更新同一条登记的连接文件。'],
  error:['本机准备需要检查','请查看本机连接器的具体提示，处理后继续当前设备登记。']
} as const

/** Informational preparation only: never infer pairing, liveness or authorization. */
export function connectionSetupProgress(device:LocalDevice|null,now=Date.now()){
  if(!device||device.revoked||device.paired||device.seen_ms>0||
    device.pairing_expires_ms!==undefined&&device.pairing_expires_ms<=now)return null
  const stage=device.setup_stage
  if(!stage||!Object.hasOwn(setupProgressStages,stage)||!device.setup_seen_ms)return null
  const fresh=now-device.setup_seen_ms<=30000&&device.setup_seen_ms<=now+5000
  const [label,detail]=setupProgressStages[stage as keyof typeof setupProgressStages]
  return fresh?{label,detail,stale:false}:{label:'暂未收到本机最近的准备状态',detail:'请检查本机连接器窗口；这不代表已配对、离线或连接失败。',stale:true}
}

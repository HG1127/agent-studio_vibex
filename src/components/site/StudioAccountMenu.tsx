import {useState} from 'react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import {ChevronDown,LogOut,Settings,ShieldCheck,UsersRound,RefreshCw} from 'lucide-react'
import {Link} from 'react-router-dom'
import {getStudioAccountInfo,logoutStudioAccount} from '@/lib/studioAuth'
import {desktopConnectionBridge,openDesktopSettings,openDesktopUpdates} from '@/lib/desktopConnectionBridge'
import {StudioSettingsDialog} from './StudioSettingsDialog'

const item='flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-40'
export function StudioAccountMenu({compact=false}:{compact?:boolean}){
 // The route-level AuthGate verifies identity; displaying the menu never refreshes it.
 const profile=getStudioAccountInfo(),desktop=desktopConnectionBridge()
 const [settingsOpen,setSettingsOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const native=async(action:'updates'|'settings')=>{
  setBusy(true);setError('')
  try{await (action==='updates'?openDesktopUpdates(desktop):openDesktopSettings(desktop))}
  catch(e){setError((e as Error).message);setSettingsOpen(true)}
  finally{setBusy(false)}
 }
 return <>
  <Dropdown.Root>
   <Dropdown.Trigger asChild><button type="button" aria-label="账号菜单" title={compact?'账号与设置':undefined}
    className={'flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-background px-2 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary '+(compact?'justify-center':'')}>
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-semibold text-primary">{profile?.display_name.slice(0,1)||'?'}</span>
    {!compact&&<><span className="min-w-0 flex-1 truncate">{profile?.display_name||'我的账号'}</span><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground"/></>}
   </button></Dropdown.Trigger>
   <Dropdown.Portal><Dropdown.Content aria-label="账号与设置" side="top" align="start" sideOffset={8} collisionPadding={12} className="z-[90] w-64 rounded-xl border border-border bg-card p-2 shadow-xl">
    <Dropdown.Label className="border-b border-border px-2 py-2 text-xs text-muted-foreground"><p className="font-semibold text-foreground">{profile?.display_name||'已登录'}</p><p className="mt-1 break-all">{profile?.email||''}</p></Dropdown.Label>
    <Dropdown.Item className={item+' mt-1'} onSelect={()=>{setError('');setSettingsOpen(true)}}><Settings size={16}/>设置</Dropdown.Item>
    <Dropdown.Item asChild><Link to="/account" className={item}><ShieldCheck size={16}/>我的账号与安全</Link></Dropdown.Item>
    {profile?.role==='admin'&&<Dropdown.Item asChild><Link to="/staff" className={item}><UsersRound size={16}/>员工与权限</Link></Dropdown.Item>}
    {desktop&&<Dropdown.Item className={item} disabled={busy} onSelect={()=>void native('updates')}><RefreshCw size={16}/>检查更新</Dropdown.Item>}
    <Dropdown.Separator className="my-1 h-px bg-border"/>
    <Dropdown.Item className={item+' text-destructive'} onSelect={logoutStudioAccount}><LogOut size={16}/>退出登录</Dropdown.Item>
   </Dropdown.Content></Dropdown.Portal>
  </Dropdown.Root>
  <StudioSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} desktop={!!desktop} busy={busy} error={error} openNative={native}/>
 </>
}

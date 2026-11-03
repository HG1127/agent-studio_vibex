import {useEffect,useState} from 'react'
import type {DesktopComputerState,DesktopGrant} from '@/lib/desktopConnectionBridge'
const button='min-h-10 rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-40'
const labels={edit:'编辑已有文件',move:'移动文件',delete:'可恢复删除 / 恢复',open:'在本机打开 / 定位'} as const
export function DesktopPermissions({state,busy,act}:{state:DesktopComputerState;busy:boolean;act:(action:string,input?:Record<string,unknown>)=>Promise<void>}){
 const p=state.permissions!
 const [sites,setSites]=useState(()=>p.origins.join('\n')),[consent,setConsent]=useState(false)
 const origins=p.origins.join('\n')
 useEffect(()=>{setSites(origins)},[origins])
 useEffect(()=>setConsent(false),[p.reviewId])
 const base={id:p.id,fingerprint:p.fingerprint,reviewId:p.reviewId}
 const running=state.profiles.some(profile=>profile.id===p.id&&profile.running)
 const change=(grant:DesktopGrant,readOnly:boolean,capabilities=grant.capabilities)=>{setConsent(false);return act('permissions.grant',{...base,key:grant.key,readOnly,capabilities:readOnly?{edit:false,move:false,delete:false,open:capabilities.open}:capabilities})}
 return <section aria-label="本机授权管理" className="space-y-4 rounded-xl border border-border bg-secondary/10 p-4"><h3 className="font-semibold">管理「{p.name}」的授权</h3>
  <label className="block text-sm">允许访问的网站<textarea className="mt-2 w-full rounded-lg border bg-background p-3" rows={3} maxLength={12000} value={sites} disabled={busy} onChange={e=>{setSites(e.target.value);setConsent(false)}} placeholder="每行一个完整网站来源，如 https://example.com"/></label>
  <button type="button" className={button} disabled={busy||sites===p.origins.join('\n')} onClick={()=>void act('permissions.sites',{...base,text:sites})}>更新网站草稿</button>
  <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||p.grants.length>=20} onClick={()=>void act('permissions.pick',{...base,kind:'folder'})}>添加文件夹</button><button type="button" className={button} disabled={busy||p.grants.length>=20} onClick={()=>void act('permissions.pick',{...base,kind:'file'})}>添加只读文件</button></div>
  {p.grants.map(g=><article key={g.key} className="space-y-2 rounded-lg border bg-background p-3"><p className="break-all text-sm font-medium">{g.path}</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!g.readOnly} disabled={busy||g.kind==='file'} onChange={e=>void change(g,!e.target.checked)}/>允许新建和复制（不覆盖）</label><div className="grid gap-2 text-sm sm:grid-cols-2">{(Object.keys(labels) as (keyof typeof labels)[]).map(k=><label key={k} className="flex items-center gap-2"><input type="checkbox" checked={g.capabilities[k]} disabled={busy||k!=='open'&&g.readOnly} onChange={e=>void change(g,g.readOnly,{...g.capabilities,[k]:e.target.checked})}/>{labels[k]}</label>)}</div><button type="button" className={button} disabled={busy} onClick={()=>void act('permissions.grant',{...base,key:g.key,remove:true})}>移除此项授权</button></article>)}
  {running&&<p className="text-sm text-muted-foreground">保存前请先暂停此连接；保存后在此处恢复即可，无需重新绑定。</p>}
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy||!p.dirty} onChange={e=>setConsent(e.target.checked)}/>我确认以上网站、文件范围和权限。</label>
  <div className="flex flex-wrap gap-2">{running&&<button type="button" className={button} disabled={busy} onClick={()=>void act('stop',{id:p.id,consent:true})}>暂停此连接</button>}<button type="button" className={button+' bg-primary text-primary-foreground'} disabled={busy||running||!p.dirty||!consent||sites!==p.origins.join('\n')} onClick={()=>void act('permissions.save',{...base,consent:true})}>保存授权</button><button type="button" className={button} disabled={busy} onClick={()=>void act('permissions.discard',base)}>关闭授权编辑</button></div>
 </section>
}

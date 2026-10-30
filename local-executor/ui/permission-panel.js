/** Local-only permission editor. Every persisted change is reviewed and scoped. */
const flags=()=>({edit:false,move:false,delete:false,open:false})
const labels={edit:'编辑已有文件（保留恢复副本）',move:'移动文件（同一授权目录，不覆盖）',delete:'可恢复删除与恢复文件',open:'在连接电脑打开文档 / 定位文件'}
const describe=g=>(g.readOnly?'读取':'读取与新建')+'；'+Object.entries(labels).map(([k,label])=>label+'：'+(g.capabilities?.[k]?'允许':'关闭')).join('；')
export function createPermissionPanel({request,effect,pick,button,confirmAction,getState,getBlocked}){
 const $=id=>document.getElementById(id),dialog=$('permission-editor')
 let rendered='',targetId='',tab='sites',requestedTab=null
 const input=()=>{const d=getState()?.permissions;if(!d)throw Error('请先打开设备授权管理。');return {id:d.id,fingerprint:d.fingerprint,reviewId:d.reviewId}}
 const error=text=>{$('permission-error').hidden=!text;$('permission-error').textContent=text||''}
 const update=()=>{
  const state=getState(),d=state?.permissions,profile=d&&state.profiles.find(p=>p.id===d.id),blocked=getBlocked()
  for(const el of dialog.querySelectorAll('button,input'))el.disabled=blocked||el.dataset.allowed==='false'
  $('permission-save').disabled=blocked||!d?.dirty||profile?.running!==false||!!$('site-input').value.trim()
  $('site-add').disabled=blocked||!d||!$('site-input').value.trim()
  $('grant-file').disabled=blocked||!d||d.grants.length>=20
  $('grant-folder').disabled=$('grant-file').disabled
 }
 const show=state=>{
  const d=state.permissions
  if(!d){if(dialog.open)dialog.close();rendered='';targetId='';$('site-input').value='';return}
  if(d.id!==targetId){targetId=d.id;rendered='';tab='sites';$('site-input').value='';error('')}
  if(requestedTab){tab=requestedTab;requestedTab=null}
  if(!dialog.open)dialog.showModal()
  $('permission-target').textContent=d.name+' · '+d.server
  const profile=state.profiles.find(p=>p.id===d.id),stopped=profile?.running===false
  $('permission-live').textContent=stopped?'改动仅在草稿中。保存授权后，从设备卡片恢复连接；无需重新配对。':'此连接仍在运行。可整理授权草稿，保存前请停止；进行中的任务可能中断。'
  $('permission-stop').hidden=stopped
  $('permission-stop').dataset.allowed=String(!stopped)
  if(rendered!==d.reviewId){
   rendered=d.reviewId
   const sites=$('permission-sites');sites.replaceChildren()
   if(!d.origins.length){const p=document.createElement('p');p.className='hint';p.textContent='没有授权网站，保存后不会开放浏览器能力。';sites.append(p)}
   for(const origin of d.origins){
    const row=document.createElement('div');row.className='permission-item'
    const text=document.createElement('span');text.textContent=origin
    row.append(text,button('移除网站',origin,true,()=>effect(()=>request('/api/permissions/sites',{...input(),text:getState().permissions.origins.filter(s=>s!==origin).join('\n')}))));sites.append(row)
   }
   const grants=$('permission-grants');grants.replaceChildren()
   if(!d.grants.length){const p=document.createElement('p');p.className='hint';p.textContent='没有文件授权。可选择单个文件或具体文件夹；保存空列表将关闭文件能力。';grants.append(p)}
   for(const grant of d.grants){
    const row=document.createElement('div');row.className='permission-grant';row.dataset.grantKey=grant.key
    const title=document.createElement('strong');title.textContent=(grant.kind==='file'?'文件 · ':'文件夹 · ')+grant.label
    const path=document.createElement('p');path.className='hint';path.textContent=grant.path;row.append(title,path)
    if(grant.kind==='file'){const p=document.createElement('p');p.className='hint';p.textContent='仅此文件 · 只读，不允许覆盖';row.append(p)}
    else{
     const label=document.createElement('label');label.className='check'
     const check=document.createElement('input');check.type='checkbox';check.checked=!grant.readOnly;check.setAttribute('aria-label','允许在 '+grant.label+' 新建文件')
     check.onchange=()=>{const readOnly=!check.checked,capabilities={...flags(),...grant.capabilities};if(readOnly){capabilities.edit=false;capabilities.move=false;capabilities.delete=false}void effect(()=>request('/api/permissions/grant',{...input(),key:grant.key,readOnly,capabilities}))}
     label.append(check,document.createTextNode('允许新建文件（不覆盖已有文件）'));row.append(label)
    }
    for(const [name,caption] of Object.entries(labels)){
     const label=document.createElement('label');label.className='check'
     const check=document.createElement('input');check.type='checkbox';check.checked=grant.capabilities?.[name]===true
     const allowed=name==='open'||grant.kind==='folder'&&!grant.readOnly
     check.dataset.allowed=String(allowed);check.disabled=!allowed;check.setAttribute('aria-label',grant.label+' '+caption)
     check.onchange=()=>{const capabilities={...flags(),...grant.capabilities,[name]:check.checked};void effect(()=>request('/api/permissions/grant',{...input(),key:grant.key,readOnly:grant.readOnly,capabilities}))}
     label.append(check,document.createTextNode(caption));row.append(label)
    }
    row.append(button('移除此授权',grant.key+':remove',true,()=>effect(()=>request('/api/permissions/grant',{...input(),key:grant.key,remove:true}))));grants.append(row)
   }
  }
  const normalized=p=>p.replaceAll('\\','/').replace(/\/$/,'').toLowerCase()
  $('permission-overlap').hidden=!d.grants.some(file=>file.kind==='file'&&d.grants.some(folder=>folder.kind==='folder'&&normalized(file.path).startsWith(normalized(folder.path)+'/')))
  $('permission-summary').textContent=d.origins.length+' 个网站 · '+d.grants.length+' 个文件或文件夹'+(d.dirty?' · 尚未保存':' · 当前授权')
  for(const k of ['sites','files']){$(k+'-tab').setAttribute('aria-selected',String(tab===k));$(k+'-panel').hidden=tab!==k}
  update()
 }
 const open=(profile,panel)=>effect(async()=>{
  const draft=getState()?.permissions
  if(draft&&(draft.dirty||$('site-input').value.trim())){
   if(draft.id===profile.id){if(['sites','files'].includes(panel)){tab=panel;show(getState())}return}
   if(!await confirmAction('放弃未保存的授权？','切换设备会放弃当前草稿，原授权不变。'))return
  }
  const result=await request('/api/permissions/open',{id:profile.id,fingerprint:profile.fingerprint})
  requestedTab=['sites','files'].includes(panel)?panel:'sites'
  return result
 })
 for(const k of ['sites','files'])$(k+'-tab').onclick=()=>{tab=k;show(getState())}
 $('site-input').oninput=update
 $('site-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('site-add').click()}}
 $('site-add').onclick=()=>effect(async()=>{const result=await request('/api/permissions/sites',{...input(),text:[...getState().permissions.origins,$('site-input').value].join('\n')});$('site-input').value='';error('');return result})
 for(const kind of ['file','folder'])$('grant-'+kind).onclick=()=>pick('/api/permissions/pick',{...input(),kind},kind,'permissions')
 $('permission-stop').onclick=()=>effect(async()=>{const id=getState().permissions.id;if(await confirmAction('停止此设备连接','只停止当前设备，准备保存新授权。进行中的任务可能中断，已发生的操作不会撤销。'))return request('/api/stop',{id,consent:true})})
 const close=()=>effect(async()=>{
  const d=getState()?.permissions;if(!d)return
  if((d.dirty||$('site-input').value.trim())&&!await confirmAction('放弃未保存的授权修改？','原网站、文件及设备绑定不变。'))return
  return request('/api/permissions/discard',input())
 })
 $('permission-close').onclick=close;$('permission-cancel').onclick=close
 dialog.oncancel=e=>{e.preventDefault();void close()}
 $('permission-save').onclick=()=>effect(async()=>{
  const d=getState().permissions,approved={...input(),consent:true}
  const lines=[d.name,d.server,'网站：'+(d.origins.join('、')||'全部关闭'),...d.grants.map(g=>(g.kind==='file'?'仅文件：':'文件夹：')+g.path+'（'+describe(g)+'）'),'只修改这台设备。旧授权下的排队任务不会自动执行；保存后需恢复连接。']
  if(await confirmAction('确认保存访问范围',lines.join('\n')))return request('/api/permissions/save',approved)
 })
 window.addEventListener('beforeunload',event=>{if(getState()?.permissions?.dirty||$('site-input').value.trim()){event.preventDefault();event.returnValue=''}})
 return {show,update,open,error}
}

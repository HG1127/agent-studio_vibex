import {createPermissionPanel} from './permission-panel.js'
import {installWorkbenchHome} from './workbench-home.js'
const showWorkbenchHome=installWorkbenchHome()
const $=id=>document.getElementById(id)
// New binding must be the first visible action. Existing profiles stay below it;
// a previously saved connection cannot hide the import/consent step.
const newConnectionSection=$('ticket')?.closest('section'),savedConnectionSection=$('profiles')?.closest('section')
if(newConnectionSection&&savedConnectionSection&&newConnectionSection.parentElement===savedConnectionSection.parentElement)savedConnectionSection.before(newConnectionSection)
const fragmentParts=location.hash.slice(1).split('&'),fragment=fragmentParts[0]
const entry=new URLSearchParams(fragmentParts.slice(1).join('&'))
let requestedEntry=/^[A-Za-z0-9]{24}$/.test(entry.get('device')||'')&&['sites','files'].includes(entry.get('panel'))?{device:entry.get('device'),panel:entry.get('panel')}:null
let token=fragment
try{if(/^[a-f0-9]{64}$/.test(fragment))sessionStorage.setItem('studio-local-session',fragment);else token=sessionStorage.getItem('studio-local-session')||''}catch{}
history.replaceState(null,'',location.pathname)
let state=null,inFlight=false,verified=false,readFailed=false,readSequence=0,noticeTimer,profileKey='',optionKey=''
let pickerHint=null,pickerEpoch=0,cancelPending=false,refreshPending=false
const pickerBox=document.createElement('div'),pickerTitle=document.createElement('strong'),pickerDetail=document.createElement('p'),pickerCancel=document.createElement('button')
pickerBox.id='picker-status';pickerBox.className='profile';pickerBox.hidden=true;pickerBox.setAttribute('role','status')
pickerDetail.className='hint';pickerCancel.id='cancel-picker';pickerCancel.type='button';pickerCancel.textContent='取消本次选择';pickerCancel.onclick=()=>void cancelPicker()
pickerBox.append(pickerTitle,pickerDetail,pickerCancel);$('folder-controls').after(pickerBox)
function showPickerStatus(){
 const active=state?.selection,hint=active||pickerHint
 pickerBox.hidden=!hint
 if(!hint)return
 const anchor=$(hint.scope==='permissions'?'permission-live':hint.scope==='edit'?'edit-folder':'folder-controls')
 if(anchor?.nextElementSibling!==pickerBox)anchor?.after(pickerBox)
 const cancelling=active?.cancelRequested||cancelPending
 const elapsed=Math.max(0,Math.floor((Date.now()-hint.startedAt)/1000))
 pickerTitle.textContent=cancelling?'正在取消本次选择，等待系统窗口关闭':active?.phase==='validating'?'正在核对所选范围':(active?.phase==='waiting'?'正在等待系统'+(hint.kind==='file'?'文件':'文件夹')+'选择结果':'正在打开系统'+(hint.kind==='file'?'文件':'文件夹')+'窗口')
 pickerDetail.textContent=cancelling?'原有草稿保留。窗口关闭后可继续操作。':'已等待 '+elapsed+' 秒。在系统窗口完成选择，或取消本次选择。'+(elapsed>=8?'如未看到窗口，请查看任务栏；可取消后重试。':'')
 pickerCancel.disabled=!active?.id||cancelling
}
const notify=(text,error=false)=>{
 clearTimeout(noticeTimer);$('message').hidden=false;$('message').textContent=text
 $('message').classList.toggle('error',error)
 if(document.getElementById('permission-editor').open)permissionPanel.error(error?text:'')
 if(!error)noticeTimer=setTimeout(()=>{$('message').hidden=true},7000)
}
async function request(route,body){
 const response=await fetch(route,{method:body===undefined?'GET':'POST',headers:{'X-Connector-Session':token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(['/api/folder','/api/file','/api/permissions/pick'].includes(route)?190000:['/api/state','/api/picker/cancel'].includes(route)?6000:90000)})
 const value=await response.json()
 if(!response.ok){const error=Error(value.error||'本机请求失败，未自动重试');error.state=value.state;throw error}
 return value
}
const confirmAction=(title,text)=>new Promise(resolve=>{
 const dialog=$('confirm');$('confirm-title').textContent=title;$('confirm-text').textContent=text
 const finish=result=>{dialog.close();$('approve').onclick=null;$('decline').onclick=null;dialog.oncancel=null;resolve(result)}
 $('approve').onclick=()=>finish(true);$('decline').onclick=()=>finish(false)
 dialog.oncancel=e=>{e.preventDefault();finish(false)};dialog.showModal()
})
const button=(label,key,allowed,action)=>{
 const b=document.createElement('button');b.type='button';b.textContent=label
 b.dataset.focusKey=key;b.dataset.allowed=String(allowed);b.onclick=action;return b
}
function updateControls(){
 const review=state?.review,editing=state?.editing
 const expired=!!review&&(review.expired||Date.now()>=review.expiresAt)
 if(expired)$('consent').checked=false
 const blocked=inFlight||!verified||!!state?.busy
 const target=editing&&state.profiles.find(p=>p.id===editing.id)
 const editable=!!target&&target.running===false
 for(const el of document.querySelectorAll('main button,main input,main select'))el.disabled=blocked||el.dataset.allowed==='false'
 $('refresh').disabled=inFlight&&!pickerHint
 permissionPanel.update()
 $('consent').disabled=blocked||!review||expired
 $('pick-folder').disabled=blocked||!review||expired||review.mode==='browser'
 $('pick-file').disabled=$('pick-folder').disabled
 $('write').disabled=$('pick-folder').disabled||review?.kind==='file'
 $('connect').disabled=blocked||!review||expired||!$('consent').checked
 $('discard').disabled=blocked||!review
 $('pick-edit-folder').disabled=blocked||!editable
 $('edit-write').disabled=blocked||!editable||!editing.folder
 $('save-folder').disabled=blocked||!editable||!editing.folder
 if(review){
  const seconds=Math.max(0,Math.ceil((review.expiresAt-Date.now())/1000))
  $('ticket-expiry').textContent=expired?'连接文件已过期。请返回对应工作台更新这条设备的连接文件；原有连接不受影响。':'连接文件还剩 '+seconds+' 秒。核对范围后再确认；过期不会自动绑定或重试。'
 }
 showPickerStatus()
}
function show(data){
 if(!data||!Array.isArray(data.profiles))throw Error('本机状态未能核实，请刷新后再操作。')
 const changedReview=state?.review?.reviewId!==data.review?.reviewId
 if(changedReview)$('consent').checked=false
 if(!data.review)$('ticket').value=''
  state=data;verified=true
  showWorkbenchHome(data)
  $('connector-version').textContent='Agent Studio · 本机连接器'+(typeof data.version==='string'?' · '+data.version:'')
 // Stable snapshots must not rebuild buttons/selects and steal keyboard focus.
 const nextKey=JSON.stringify(data.profiles)
 if(nextKey!==profileKey){
  profileKey=nextKey
  const active=document.activeElement?.dataset?.focusKey,list=$('profiles');list.replaceChildren()
  for(const p of data.profiles){
   const card=document.createElement('div');card.className='profile';card.dataset.profileId=p.id
   const head=document.createElement('strong');head.textContent=p.name+' · '+(p.reasonCode==='device_identity_rejected'?'原绑定未通过验证':({stopped:'未由本程序启动',starting:'正在连接工作台',online:'服务器已确认在线','needs-check':'连接需要检查',failed:'连接启动失败',stopping:'正在停止'})[p.state]||'状态待核实');card.append(head)
   const detail=document.createElement('p');detail.textContent=p.server+' · '+p.roots.map(r=>r.label+'（'+(r.readOnly?'读取':'读取与新建')+['edit','move','delete','open'].filter(k=>r.capabilities?.[k]).map(k=>'、'+({edit:'编辑',move:'移动',delete:'可恢复删除',open:'在电脑打开/定位'})[k]).join('')+'）').join('、')+(p.origins.length?' · '+p.origins.join('、'):'');card.append(detail)
   const row=document.createElement('div');row.className='row'
    if(p.message){const message=document.createElement('p');message.className='hint';message.dataset.connectionMessage='true';message.setAttribute('role','status');message.textContent=p.message;card.append(message)}
   row.append(button(p.state==='failed'?'重试原连接':'恢复连接',p.id+':resume',p.running===false,()=>effect(async()=>{
    if(await confirmAction('确认恢复原连接',p.name+'\n'+p.server+'\n沿用上面显示的文件夹和网站范围，不新增配对。'))return request('/api/resume',{id:p.id,fingerprint:p.fingerprint,consent:true})
   })))
   row.append(button('停止本机连接',p.id+':stop',p.running===true,()=>effect(async()=>{
    if(await confirmAction('停止本机连接','停止本程序启动的连接。账号绑定保留，已发生的操作不会撤销。'))return request('/api/stop',{id:p.id,consent:true})
   })))
   if(p.browserEnabled&&p.browserChannel!=='chrome')row.append(button('切换到 Chrome',p.id+':chrome',p.running===false,()=>effect(async()=>{
    if(await confirmAction('切换浏览器','先停止原连接。只改变自动化浏览器，不改变网站或文件授权。'))return request('/api/chrome',{id:p.id,fingerprint:p.fingerprint,consent:true})
   })))
   row.append(button('管理授权',p.id+':permissions',true,()=>permissionPanel.open(p)))
   const link=document.createElement('a');link.textContent='打开对应工作台';link.href=new URL('/tool-hub?view=devices',p.server).href;link.target='_blank';link.rel='noopener noreferrer';row.append(link)
   card.append(row);list.append(card)
  }
  if(!data.profiles.length){const empty=document.createElement('p');empty.textContent='尚未找到已保存连接。请在下方选择工作台下载的连接文件。';list.append(empty)}
  const restore=active&&[...list.querySelectorAll('[data-focus-key]')].find(el=>el.dataset.focusKey===active)
  if(restore&&restore.dataset.allowed==='true'&&!$('confirm').open)restore.focus({preventScroll:true})
 }
 const options=data.profiles.filter(p=>p.filesEnabled).map(p=>({id:p.id,name:p.name,server:p.server}))
 if(JSON.stringify(options)!==optionKey){
  optionKey=JSON.stringify(options);$('edit-profile').replaceChildren(new Option('请选择',''))
  for(const p of options)$('edit-profile').append(new Option(p.name+' · '+p.server,p.id))
 }
 permissionPanel.show(data)
 if(requestedEntry){
  const requested=requestedEntry;requestedEntry=null
  const profile=data.profiles.find(p=>p.id===requested.device)
  if(profile)setTimeout(()=>void permissionPanel.open(profile,requested.panel),0)
  else notify('这台电脑未找到工作台指定的连接，未打开其他设备的授权。请核对设备后再操作。',true)
 }
 $('edit-profile').value=data.editing?.id||''
 $('review').hidden=!data.review
 if(data.review){
  const r=data.review,items=[['账号服务器',r.server],['电脑名称',r.name],['用途',({files:'文件与表格',browser:'仅浏览器',both:'浏览器＋文件'})[r.mode]],['允许访问的网站',r.origins.join('、')||'浏览器关闭'],[r.kind==='file'?'仅此文件':'工作文件夹',r.mode==='browser'?'文件能力关闭':r.folder+'（'+(r.readOnly?'只读':'允许新建，不覆盖')+'）']]
  if(changedReview){$('scope').replaceChildren();for(const [key,val] of items){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=val;$('scope').append(dt,dd)}}
  $('folder-controls').hidden=r.mode==='browser'
  $('return-workspace').href=new URL('/tool-hub?view=devices',r.server).href
 }
 $('folder').textContent=data.selectedFolder||'默认使用专用工作文件夹，不开放整盘。'
 $('write').checked=!data.readOnly
 $('edit-folder').textContent=data.editing?.folder||'尚未为此连接选择新的目录'
 $('edit-write').checked=data.editing?.readOnly===false
 const target=data.profiles.find(p=>p.id===data.editing?.id)
 $('edit-current').textContent=target?'正在设置「'+target.name+'」 · '+target.server+'。'+(target.running===false?'选择新的文件夹后单独确认，不影响新设备连接草稿。':'请先停止这条连接，再更换目录。'):'选择一台设备后再设置，不会沿用其他设备的目录或权限。'
 updateControls()
}
async function effect(fn){
 if(inFlight)return
 inFlight=true;readSequence++;updateControls()
 try{const result=await fn();readSequence++;if(result){show(result);if(result.notice)notify(result.notice)}}
 catch(e){readSequence++;if(e.state)show(e.state);else{verified=false;readFailed=true;$('consent').checked=false}notify(e.message+' 不会自动重新提交。',true)}
 finally{readSequence++;inFlight=false;updateControls()}
}
async function refresh(){
 if(inFlight&&!pickerHint||refreshPending)return
 refreshPending=true
 const sequence=++readSequence
 try{const data=await request('/api/state');if(sequence===readSequence&&(!inFlight||pickerHint)){show(data);if(readFailed){readFailed=false;notify('本机状态已恢复，原输入已保留。请重新核对范围后继续。')}}}
 catch(e){if(sequence===readSequence&&(!inFlight||pickerHint)){verified=false;readFailed=true;$('consent').checked=false;notify('暂时无法核实本机状态，输入已保留。点击刷新状态后再操作。',true);updateControls()}}
 finally{refreshPending=false}
}
async function runPickerRequest(route,body,kind,scope){
 if(inFlight||state?.busy||!verified)return
 const epoch=++pickerEpoch
 pickerHint={kind,scope,startedAt:Date.now()}
 if(scope==='connect')$('consent').checked=false
 const timer=setInterval(()=>void refresh(),500)
 try{const pending=effect(()=>request(route,body));void refresh();await pending}
 finally{clearInterval(timer);if(epoch===pickerEpoch){pickerHint=null;updateControls();void refresh()}}
}
async function cancelPicker(){
 const id=state?.selection?.id,epoch=pickerEpoch
 if(!id||cancelPending)return
 cancelPending=true;updateControls()
 try{
  const result=await request('/api/picker/cancel',{id})
  if(epoch===pickerEpoch&&state?.selection?.id===id){readSequence++;show(result);if(result.notice)notify(result.notice)}
 }catch(e){if(epoch===pickerEpoch&&state?.selection?.id===id)notify(e.message,true)}
 finally{cancelPending=false;updateControls();void refresh()}
}
const editInput=()=>{
 const edit=state?.editing
 if(!edit)throw Error('请先选择要修改的已有连接。')
 return {scope:'edit',id:edit.id,fingerprint:edit.fingerprint,reviewId:edit.reviewId}
}
$('refresh').onclick=()=>void refresh()
$('ticket').onchange=()=>{
 $('consent').checked=false
 void effect(async()=>{
  const file=$('ticket').files[0];if(!file)return
  let value
  try{if(file.size>16000)throw Error();value=JSON.parse(await file.text())}
  catch{show(await request('/api/discard',{reviewId:state.reviewId}));throw Object.assign(Error('请选择工作台生成的有效连接文件，不是程序压缩包。'),{state})}
  return request('/api/prepare',{ticket:value})
 })
}
$('pick-folder').onclick=()=>runPickerRequest('/api/folder',{scope:'connect'},'folder','connect')
$('pick-file').onclick=()=>runPickerRequest('/api/file',{},'file','connect')
$('pick-edit-folder').onclick=()=>runPickerRequest('/api/folder',editInput(),'folder','edit')
$('write').onchange=()=>{const readOnly=!$('write').checked;$('consent').checked=false;void effect(()=>request('/api/access',{scope:'connect',readOnly}))}
$('edit-write').onchange=()=>{const readOnly=!$('edit-write').checked;void effect(()=>request('/api/access',{...editInput(),readOnly}))}
$('consent').onchange=updateControls
$('edit-profile').onchange=()=>{
 const profile=state.profiles.find(p=>p.id===$('edit-profile').value)
 void effect(()=>request('/api/edit-select',{id:profile?.id||'',...(profile?{fingerprint:profile.fingerprint}:{})}))
}
$('connect').onclick=()=>effect(()=>request('/api/connect',{reviewId:state.review.reviewId,consent:$('consent').checked}))
$('discard').onclick=()=>effect(()=>request('/api/discard',{reviewId:state.reviewId}))
$('save-folder').onclick=()=>effect(async()=>{
 const edit=state.editing,p=state.profiles.find(x=>x.id===edit?.id);if(!p||!edit.folder)return
 const approved={id:edit.id,fingerprint:edit.fingerprint,reviewId:edit.reviewId,consent:true}
 if(await confirmAction('确认更换本机授权文件夹',p.name+'\n'+p.server+'\n新目录：'+edit.folder+'\n权限：'+(edit.readOnly?'只读':'允许新建，不覆盖')+'\n不会改动其他连接或新设备草稿，旧目录任务不会转移到这里。'))return request('/api/folder-save',approved)
})
const permissionPanel=createPermissionPanel({request,effect,pick:runPickerRequest,button,confirmAction,getState:()=>state,getBlocked:()=>inFlight||!verified||!!state?.busy})
if(!/^[a-f0-9]{64}$/.test(token)){
 notify('本机管理会话缺失，请关闭此页并从启动器重新打开。',true)
 document.querySelectorAll('button,input,select').forEach(el=>el.disabled=true)
}else{
 void refresh()
 setInterval(()=>{if(document.visibilityState==='visible')void refresh()},8000)
 setInterval(updateControls,1000)
 window.addEventListener('focus',()=>void refresh())
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh()})
}

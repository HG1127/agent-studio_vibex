const byId=id=>document.getElementById(id)
let busy=false,current=null,view='overview',feedDirty=false,historyKey='',notesKey=''
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element}
const date=value=>{const parsed=new Date(value);return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric'}).format(parsed):'发布日期待确认'}
const bytes=value=>Number.isFinite(value)?(value/1024/1024).toFixed(1)+' MB':'—'
const compare=(a,b)=>{const parts=s=>String(s).split(/[.\-]/).map(p=>p==='preview'?-1:Number(p));const x=parts(a),y=parts(b);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]??Infinity)-(y[i]??Infinity);if(d)return d>0?1:-1}return 0}
const icons={idle:'update',checking:'refresh',available:'download',current:'check',downloading:'download',ready:'check',error:'alert'}
const messages={idle:['软件更新','检查工作台更新'],checking:['正在检查','正在查找新版本'],available:['有可用更新','新版本可供更新'],current:['已是最新','已安装最新版本'],downloading:['下载更新','正在下载更新'],ready:['校验通过','更新已准备就绪'],error:['需要重试','更新暂未完成']}
function changeGroups(text){
 const groups=[];let active
 for(const raw of String(text||'').split(/\r?\n/)){
  const line=raw.trim();if(!line)continue
  const heading=/^\[([^\]]{1,30})\]$/.exec(line)||/^#{1,3}\s+(.{1,30})$/.exec(line)
  if(heading){active={title:heading[1],items:[]};groups.push(active);continue}
  if(!active){const title=/^新增/.test(line)?'新增功能':/^修复/.test(line)?'问题修复':'体验改进';active={title,items:[]};groups.push(active)}
  active.items.push(line.replace(/^[-*•]\s+/,''))
 }
 return groups.filter(group=>group.items.length)
}
function renderNotes(target,text){
 const groups=changeGroups(text);target.replaceChildren()
 if(!groups.length){target.append(node('p','暂无详细迭代说明。','empty-copy'));return}
 for(const group of groups){const section=node('div',undefined,'change-group'),label=node('span',group.title,'change-label');label.dataset.kind=/新增|功能/.test(group.title)?'feature':/修复|问题/.test(group.title)?'fix':'improvement';section.append(label);const list=node('ul');for(const item of group.items)list.append(node('li',item));section.append(list);target.append(section)}
}
function renderHistory(releases,installed){
 const key=JSON.stringify([installed,releases]);if(key===historyKey)return;historyKey=key
 const list=byId('history-list'),opened=new Set([...list.querySelectorAll('details[open]')].map(e=>e.dataset.version));list.replaceChildren();byId('history-count').textContent=String(releases.length)
 if(!releases.length){list.append(node('p','暂无版本历史。检查更新后可获取最新迭代记录。','history-empty'));return}
 releases.forEach((release,index)=>{
  const card=node('details',undefined,'history-card');card.dataset.version=release.version;card.open=opened.has(release.version)||!opened.size&&index===0
  const summary=node('summary'),marker=node('span',undefined,'history-marker'),content=node('div',undefined,'history-summary'),top=node('div',undefined,'history-topline');top.append(node('strong',release.version));if(release.version===installed)top.append(node('span','当前安装','installed-pill'));content.append(top,node('p',release.title||'版本更新'))
  const time=node('time',date(release.publishedAt));time.dateTime=release.publishedAt||''
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-chevron');svg.append(use)
  summary.append(marker,content,time,svg);const notes=node('div',undefined,'history-content');renderNotes(notes,release.notes);card.append(summary,notes);list.append(card)
 })
}
function showView(next){
 view=next;for(const name of ['overview','history','settings'])byId('view-'+name).hidden=name!==next
 document.querySelectorAll('.navigation button').forEach(button=>{if(button.dataset.view===next)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')})
 const copy={overview:['版本更新','查看新版本、迭代说明和更新进度。'],history:['版本历史','按版本查看功能更新与问题修复。'],settings:['更新设置','连接公司更新服务，管理版本获取方式。']}[next]
 byId('page-title').textContent=copy[0];byId('page-description').textContent=copy[1]
}
function render(incoming){
 current={...current,...incoming};const state=current,phase=state.phase||'idle',installed=state.currentVersion||'—',releases=Array.isArray(state.releases)?state.releases.slice(0,12):[]
 const latest=state.version&&compare(state.version,installed)>0?state.version:installed,release=releases.find(r=>r.version===latest)||{version:latest,title:'版本说明',notes:state.notes||'',publishedAt:state.publishedAt}
 byId('current').textContent=installed;byId('installed-version').textContent=installed;byId('latest-version').textContent=state.version?latest:'待检查'
 byId('update-card').dataset.phase=phase;const copy=messages[phase]||messages.error;byId('state-badge').textContent=copy[0];byId('headline').textContent=copy[1];byId('status').textContent=state.message||'';byId('status-glyph').setAttribute('href','#i-'+(icons[phase]||'alert'))
 const blocked=busy||['checking','downloading'].includes(phase)
 byId('check').disabled=blocked;byId('save').disabled=blocked;byId('check-label').textContent=phase==='idle'?'检查更新':'重新检查';byId('download').hidden=phase!=='available';byId('download').disabled=busy;byId('install').hidden=phase!=='ready';byId('install').disabled=busy
 byId('download-progress').hidden=phase!=='downloading';byId('progress').value=Math.min(100,Math.max(0,Number(state.progress)||0));byId('progress-value').textContent=byId('progress').value+'%';byId('progress-label').textContent=state.progress>=100?'正在校验更新文件':'正在下载更新';byId('download-size').textContent=bytes(state.downloaded||0)+' / '+bytes(state.size)
 byId('action-hint').textContent=phase==='ready'?'请先保存工作，重启后即可使用新版本。':phase==='error'?'可以重新检查，或在更新设置中确认服务地址。':phase==='downloading'?'正在下载并验证更新，请稍候。':'更新将在原位置完成，保留账号和电脑授权。'
 const releaseKey=JSON.stringify(release);if(releaseKey!==notesKey){notesKey=releaseKey;byId('release-version').textContent=release.version;byId('release-title').textContent=release.title||'版本说明';byId('release-date').textContent=date(release.publishedAt);byId('release-date').dateTime=release.publishedAt||'';renderNotes(byId('notes'),release.notes)}
 renderHistory(releases,installed)
 if(state.feed&&!feedDirty&&document.activeElement!==byId('feed'))byId('feed').value=state.feed
 if(state.checkedAt){const time=new Date(state.checkedAt);byId('last-checked').textContent='最近检查 '+new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(time)}
 if(view==='settings'&&phase==='error')byId('settings-result').textContent=state.message||'暂时无法连接更新服务'
}
async function request(action,input){
 if(busy)return;busy=true;if(current)render(current)
 try{const state=await window.desktopUpdates.request(action,input);if(action==='feed'){feedDirty=false;state.feed=input;byId('settings-result').textContent='更新地址已保存';showView('overview')}render(state)}
 catch(error){const message=error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');let authoritative;try{authoritative=await window.desktopUpdates.request('state')}catch{}render({...current,phase:'error',...authoritative,message});if(view==='settings')byId('settings-result').textContent=message}
 finally{busy=false;if(current)render(current)}
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)))
byId('check').onclick=()=>request('check');byId('download').onclick=()=>request('download');byId('install').onclick=()=>request('install')
byId('feed').oninput=()=>{feedDirty=true;byId('settings-result').textContent=''}
byId('save').onclick=()=>{if(!byId('feed').checkValidity()||!byId('feed').value.trim()){byId('settings-result').textContent='请输入完整的更新服务地址';byId('feed').focus();return}void request('feed',byId('feed').value.trim())}
window.desktopUpdates.onState(render)
void request('state')

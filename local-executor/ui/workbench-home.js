/** Explicit navigation only: no pairing, permission edits, local probing or jobs. */
export function workbenchForProfile(profile){
 if(!profile||typeof profile.id!=='string'||!/^[A-Za-z0-9]{24}$/.test(profile.id))return null
 try{
  const url=new URL(profile.server)
  if(url.username||url.password||url.search||url.hash||!['','/','/__pb','/__pb/'].includes(url.pathname)||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return null
  return url.origin+'/tool-hub?view=devices&device='+encodeURIComponent(profile.id)
 }catch{return null}
}
export function installWorkbenchHome(doc=document){
 const main=doc.querySelector('main'),header=main?.querySelector('header')
 if(!main||!header)return ()=>{}
 const section=doc.createElement('section');section.id='workbench-home';section.hidden=true
 section.setAttribute('aria-label','进入系统工作区')
 const title=doc.createElement('h2');title.textContent='连接已就绪，日常操作回到系统完成'
 const hint=doc.createElement('p');hint.textContent='浏览与编辑文件、移动、删除与恢复、浏览器和授权管理都在系统的电脑工作区。这个窗口只用于首次绑定、恢复连接和排查故障。'
 const links=doc.createElement('div');links.className='row'
 const foot=doc.createElement('p');foot.className='hint';foot.textContent='可以关闭这个管理网页，但请保留连接器 CMD 进程。打开文件时，Word 等软件窗口仍出现在被连接电脑上。'
 section.append(title,hint,links,foot);header.after(section)
 let key=''
 return state=>{
  const online=(state?.profiles||[]).filter(p=>p.state==='online'&&workbenchForProfile(p))
  const next=JSON.stringify(online.map(p=>[p.id,p.name,p.server]))
  section.hidden=online.length===0||!!state?.review
  if(next===key)return;key=next;links.replaceChildren()
  for(const profile of online){
   const link=doc.createElement('a');link.href=workbenchForProfile(profile);link.target='_blank';link.rel='noopener noreferrer';link.className='primary';link.textContent='进入 '+profile.name+' 的系统工作区'
   links.append(link)
  }
 }
}

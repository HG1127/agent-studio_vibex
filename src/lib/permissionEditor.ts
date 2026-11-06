/** Pure, memory-only editor helpers. Never store paths, credentials or grants in browser storage. */
export type WebsiteDraft={revision:string;base:string[];sites:string[];input:string}
export function sameWebsiteSet(a:readonly string[],b:readonly string[]){
 return a.length===b.length&&[...a].sort().every((site,i)=>site===[...b].sort()[i])
}
export function websiteChanges(base:readonly string[],sites:readonly string[]){
 const previous=new Set(base),next=new Set(sites)
 return {added:sites.filter(s=>!previous.has(s)),removed:base.filter(s=>!next.has(s))}
}
export function normalizeWebsite(value:string){
 const text=value.trim()
 if(!text||text.length>2000||/[\s*\\\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(text))throw Error('请填写网站地址，不支持通配符、空格或控制字符。')
 let url:URL
 try{url=new URL(text.includes('://')?text:'https://'+text)}catch{throw Error('网站地址不正确，例如 example.com 或 https://example.com。')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.hostname||url.origin.length>500)throw Error('请只粘贴网站地址，不要包含账号、密码、查询参数或访问令牌。')
 return url.origin
}
/** All-or-nothing batch validation; invalid entries never silently disappear. */
export function prepareWebsiteBatch(input:string,existing:readonly string[]){
 if(input.length>12000)throw Error('粘贴内容过长；一次最多授权12个网站。')
 const entries=input.split(/[\r\n,，;；]+/).map(s=>s.trim()).filter(Boolean)
 if(entries.length>50)throw Error('一次粘贴的网站过多，请分批整理。')
 const unique=[...existing];let duplicates=0
 for(let i=0;i<entries.length;i++){
  let origin:string
  try{origin=normalizeWebsite(entries[i])}catch(e){throw Error('第'+(i+1)+'项：'+(e as Error).message)}
  if(unique.includes(origin)){duplicates++;continue}
  unique.push(origin)
 }
 if(unique.length>12)throw Error('去重后超过12个网站，请移除不需要的授权再保存。')
 return {sites:unique,added:unique.length-existing.length,duplicates}
}
/** File-only revisions can rebase a site draft; competing site edits must never be overwritten. */
export function reconcileWebsiteDraft(draft:WebsiteDraft,latest:{revision?:string;sites:string[]}){
 const nextRevision=latest.revision||''
 if(!draft.revision)return {draft:{revision:nextRevision,base:[...latest.sites],sites:[...latest.sites],input:draft.input},conflict:false}
 if(draft.revision===nextRevision)return {draft,conflict:false}
 if(sameWebsiteSet(draft.sites,draft.base))return {draft:{revision:nextRevision,base:[...latest.sites],sites:[...latest.sites],input:draft.input},conflict:false}
 if(sameWebsiteSet(draft.base,latest.sites)||sameWebsiteSet(draft.sites,latest.sites))return {draft:{...draft,revision:nextRevision,base:[...latest.sites]},conflict:false}
 return {draft,conflict:true}
}
export function selectionRemaining(expiresAt:number,now=Date.now()){
 if(!Number.isFinite(expiresAt)||!Number.isFinite(now))return 0
 return Math.max(0,Math.ceil((expiresAt-now)/1000))
}
export function formatRemaining(seconds:number){
 return seconds<=0?'已过期':Math.floor(seconds/60)+'分'+String(seconds%60).padStart(2,'0')+'秒'
}

/** Bounded short-lived pairing ticket, not a login or executor configuration. */
export type LocalConnectionMode='browser'|'files'|'both'
export type LocalConnectionTicket={
  format:'agent-studio-connect-v1';server:string;name:string;mode:LocalConnectionMode;
  origins:string[];pairing:{id:string;code:string;expiresAt:number}
}
export function connectionServer(value:string):string{
  let url:URL
  try{url=new URL(value)}catch{throw Error('连接地址无效，请使用当前系统的 HTTPS 地址。')}
  if(url.username||url.password||url.search||url.hash||!['/','/__pb','/__pb/'].includes(url.pathname)||
     !(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))
    throw Error('远程连接必须使用 HTTPS；本机预览才可使用 localhost 的 HTTP 地址。')
  return url.origin+url.pathname.replace(/\/$/,'')
}
export function connectionOrigins(text:string):string[]{
  const lines=text.split(/[\n,，]/).map(x=>x.trim()).filter(Boolean)
  if(lines.length>12)throw Error('最多填写 12 个明确授权的网站，不支持通配符。')
  return [...new Set(lines.map(value=>{
    if(value.length>1000||/[\s*\\\x00-\x1f]/.test(value))throw Error('请填写完整网站地址，不支持通配符、空格或命令。')
    let url:URL
    try{url=new URL(value.includes('://')?value:'https://'+value)}catch{throw Error('网站地址格式不正确。')}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.hostname)
      throw Error('仅填写网站地址，不要附带密码、查询参数或访问令牌。')
    return url.origin
  }))]
}
export function validateConnectionTicket(value:unknown,now=Date.now()):LocalConnectionTicket{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('连接文件格式不正确。')
  const row=value as Record<string,unknown>,keys=['format','server','name','mode','origins','pairing']
  if(Object.keys(row).some(key=>!keys.includes(key))||row.format!=='agent-studio-connect-v1'||
     typeof row.server!=='string'||typeof row.name!=='string'||row.name.length>80||!row.name.trim()||/[\x00-\x1f\x7f]/.test(row.name)||
     !['browser','files','both'].includes(String(row.mode))||!Array.isArray(row.origins)||row.origins.some(x=>typeof x!=='string'))
    throw Error('连接文件包含不支持的配置；请在系统中重新生成。')
  const pair=row.pairing as Record<string,unknown>|null
  if(!pair||typeof pair!=='object'||Array.isArray(pair)||Object.keys(pair).some(key=>!['id','code','expiresAt'].includes(key))||
     typeof pair.id!=='string'||!/^[A-Za-z0-9]{24}$/.test(pair.id)||typeof pair.code!=='string'||!/^[A-Za-z0-9]{48}$/.test(pair.code)||
     !Number.isSafeInteger(pair.expiresAt)||Number(pair.expiresAt)<=now||Number(pair.expiresAt)>now+305000)
    throw Error('连接凭证已过期或无效，请返回页面重新生成。')
  const sourceOrigins=row.origins as string[],origins=connectionOrigins(sourceOrigins.join('\n'))
  if(origins.length!==sourceOrigins.length||origins.some((origin,i)=>origin!==sourceOrigins[i]))
    throw Error('连接文件中的网站必须是明确的来源地址。')
  if(row.mode==='files'?origins.length>0:origins.length===0)throw Error('请选择需要连接的用途并填写授权网站。')
  return {format:'agent-studio-connect-v1',server:connectionServer(row.server),name:row.name.trim(),
    mode:row.mode as LocalConnectionMode,origins,pairing:{id:pair.id,code:pair.code,expiresAt:Number(pair.expiresAt)}}
}
export function deviceConnectionState(device:{revoked:boolean;seen_ms:number},now=Date.now()):'revoked'|'online'|'offline'|'waiting'{
  if(device.revoked)return 'revoked'
  if(!Number.isFinite(device.seen_ms)||device.seen_ms<=0)return 'waiting'
  return now>=device.seen_ms&&now-device.seen_ms<45000?'online':'offline'
}
export function connectionCapabilitiesReady(ticket:Pick<LocalConnectionTicket,'mode'>,names:readonly string[]):boolean{
  return (ticket.mode==='files'||names.includes('browser.browser_navigate'))&&
    (ticket.mode==='browser'||names.includes('files.list'))
}

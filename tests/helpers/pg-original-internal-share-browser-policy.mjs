/** Pure route restrictions; never an authentication/capability grant. */
export function originalInternalSharePath(raw){
 if(typeof raw!=='string'||raw.length>8192||!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u001f\u007f-\u009f]/u.test(raw)||raw.includes('#'))return null
 const wire=raw.split('?',1)[0];if(/%2f|%5c/i.test(wire))return null
 let decoded;try{decoded=decodeURIComponent(wire)}catch{return null}
 if(!decoded.startsWith('/')||decoded.startsWith('//')||/[\\%\u0000-\u001f\u007f-\u009f]/u.test(decoded)||decoded!=='/'&&decoded.split('/').slice(1).some(p=>!p||p==='.'||p==='..'))return null
 return decoded
}
export function originalInternalSharePolicy(method,raw,accept=''){
 const pathname=originalInternalSharePath(raw)
 if(!pathname)return{kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(pathname))return{kind:'legacy_denied',pathname}
 if(pathname.startsWith('/__pg_native/')){
  if(raw!==pathname)return{kind:'api_denied',pathname}
  const auth='/__pg_native/api/native-auth/',share='/__pg_native/api/v2/internal-templates'
  if(method==='GET'&&[auth+'me',auth+'capabilities',share].includes(pathname)||method==='POST'&&[auth+'login',auth+'logout',share,share+'/confirm'].includes(pathname))return{kind:'native',pathname}
  return{kind:'api_denied',pathname}
 }
 if(pathname==='/api'||pathname.startsWith('/api/')||pathname.startsWith('/__'))return{kind:'api_denied',pathname}
 if(!['GET','HEAD'].includes(method))return{kind:'denied',pathname}
 if(pathname==='/index.html'||pathname==='/agent-studio.svg'||pathname.startsWith('/assets/'))return{kind:'asset',pathname}
 if(['/login','/internal-templates'].includes(pathname)&&typeof accept==='string'&&accept.includes('text/html'))return{kind:'spa',pathname}
 return{kind:'denied',pathname}
}

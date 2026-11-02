import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
export {originalLoginPath as originalVersionReleasePath}
const root='/__pg_native',auth=root+'/api/native-auth/',v2=root+'/api/v2/',u='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const release=new RegExp('^'+v2+'original-ui/agent-releases/'+u+'(?:/(change|acceptance|versions|receipts)(?:/('+u+'))?)?$'),agent=new RegExp('^'+v2+'original-ui/agent-specs/'+u+'$'),full=new RegExp('^'+v2+'agent-autonomous-runs/'+u+'(?:/steps)?$'),feedback=new RegExp('^'+v2+'agent-feedback/'+u+'$')
const metadata=new Set(['own-overview','own-todos','original-ui/agent-workspace','original-ui/agent-pending','original-ui/monitor-inbox','original-ui/agent-catalog','original-ui/home-resources','tool-connections','mcp-connections','knowledge-bases','shared-knowledge','knowledge-embedding/consent','agent-autonomous-runs'].map(p=>v2+p))
export function originalVersionReleasePolicy(method,raw,accept=''){
 const pathname=originalLoginPath(raw);if(!pathname)return{kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(pathname))return{kind:'legacy_denied',pathname}
 if(pathname.startsWith(root+'/')){
  if(raw.split('?',1)[0]!==pathname)return{kind:'api_denied',pathname}
  const match=release.exec(pathname),url=new URL(raw,'https://policy.invalid')
  if(match){if(raw!==pathname)return{kind:'api_denied',pathname};const part=match[1],id=match[2];if(method==='GET'&&(!part||id&&['acceptance','versions','receipts'].includes(part)))return{kind:'native',pathname};if(method==='POST'&&!id&&['acceptance','change'].includes(part))return{kind:'native',pathname};return{kind:'api_denied',pathname}}
  if(raw!==pathname&&!url.search)return{kind:'api_denied',pathname}
  if(method==='GET'&&[auth+'me',auth+'capabilities'].includes(pathname)&&!url.search)return{kind:'native',pathname}
  if(method==='POST'&&[auth+'login',auth+'logout'].includes(pathname)&&!url.search)return{kind:'native',pathname}
  if(method==='GET'&&(agent.test(pathname)||full.test(pathname)||feedback.test(pathname)||metadata.has(pathname)||pathname===v2+'model-connections')){
   if(pathname.endsWith('/steps')&&!url.search)return{kind:'api_denied',pathname}
   if(url.search){
    const q=url.searchParams,canonical=url.search==='?'+q.toString(),keys=[...q.keys()].join(',')
    const cursor=q.get('cursor'),model=pathname===v2+'model-connections'&&['paging,limit','paging,limit,cursor'].includes(keys)&&q.get('paging')==='owner_cursor_v1'&&q.get('limit')==='50'&&(cursor===null||/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(cursor))
    const catalog=pathname===v2+'original-ui/agent-catalog'&&keys==='page,perPage,sort'&&/^[1-9][0-9]{0,2}$/.test(q.get('page')??'')&&Number(q.get('page'))<=200&&q.get('perPage')==='50'&&q.get('sort')==='updated_desc'
    const workspace=pathname===v2+'original-ui/agent-workspace'&&url.search==='?limit=12'
    const steps=pathname.endsWith('/steps')&&keys==='limit,after'&&q.get('limit')==='100'&&/^(?:|wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100})$/.test(q.get('after')??'!')
    if(!canonical||!(model||catalog||workspace||steps))return{kind:'api_denied',pathname}
   }
   return{kind:'native',pathname}
  }
  return{kind:'api_denied',pathname}
 }
 if(pathname==='/api'||pathname.startsWith('/api/')||pathname.startsWith('/__'))return{kind:'api_denied',pathname}
 if(!['GET','HEAD'].includes(method))return{kind:'denied',pathname}
 if(pathname==='/index.html'||pathname==='/agent-studio.svg'||pathname.startsWith('/assets/'))return{kind:'asset',pathname}
 if(['/login','/version-release','/run-detail'].includes(pathname)&&accept.includes('text/html'))return{kind:'spa',pathname}
 return{kind:'denied',pathname}
}

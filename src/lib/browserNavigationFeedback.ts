export function browserNavigationHint(value:string){
 const text=value.toLowerCase()
 if(/browser_no_open_page|about:blank/.test(text))return '独立浏览器还没有打开网页。读取当前页面不会访问目标输入框；请先点击“打开目标网页”。'
 if(/browser_dns_failed|err_name_not_resolved|err_name_resolution_failed|enotfound|eai_again|name_not_resolved/.test(text))return '无法解析域名。请检查这台电脑的 DNS / hosts 配置；加入授权清单不代表网站一定可访问。'
 if(/browser_connection_refused|err_connection_refused|econnrefused/.test(text))return '目标服务器拒绝连接，请核对地址、端口和服务状态。无需重新配对电脑。'
 if(/browser_tls_failed|err_cert|certificate|ssl|tls/.test(text))return 'HTTPS/TLS 握手失败。请核对 HTTP/HTTPS 地址与证书，不会自动降级协议。'
 if(/browser_navigation_timeout|err_timed_out|etimedout|timeout|timed out/.test(text))return '打开网页超时，尚未取得可核验的页面内容。检查网络和服务后再手动重试。'
 if(/blockedbyclient|err_blocked_by_client|browser_origin_denied/.test(text))return '请求被网站授权或跨域跳转安全规则拦截。请核对最终跳转域名并由本人明确授权。'
 if(/browser_http_error/.test(text))return '服务器已响应，但返回了 HTTP 错误页面。请检查网站部署和地址，不应重新配对设备。'
 if(/browser_page_closed/.test(text))return '受控浏览器已关闭。请重新打开目标网页；读取页面本身不会新建浏览器。'
 return '导航未能返回可核验的页面内容。请检查目标网址与本机连接器；不会自动重试。'
}
export function looksLikeDefaultSite(value:string){return /恭喜，站点创建成功|这是默认index\.html|default index\.html/i.test(value)}
export function localTestAddress(value:string){try{return new URL(value).hostname.endsWith('.test')}catch{return false}}
const prefix='STUDIO_BROWSER_PAGE_V1:'
const displayUrl=(raw:string)=>{try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return raw==='about:blank'?'about:blank':'';u.username='';u.password='';u.search='';u.hash='';return u.href.slice(0,2000)}catch{return ''}}
export type BrowserObservation={url:string;title:string;blank:boolean;placeholder:boolean;redirected:boolean;httpStatus:number|null;verified:boolean}
/** Metadata is read from the tool envelope/header, never from arbitrary page prose. */
export function browserPageFromResult(value:string):BrowserObservation|null{
 if(value.startsWith(prefix)){
  try{const p=JSON.parse(value.split('\n',1)[0].slice(prefix.length));if(p.version!==1||typeof p.url!=='string'||!displayUrl(p.url)||typeof p.title!=='string')return null
   return {url:displayUrl(p.url),title:p.title.slice(0,300),blank:p.url==='about:blank',placeholder:p.placeholder===true,redirected:p.redirected===true,httpStatus:Number.isInteger(p.httpStatus)&&p.httpStatus>=100&&p.httpStatus<600?p.httpStatus:null,verified:p.url!=='about:blank'}
  }catch{return null}
 }
 const section=value.split(/^### /m).find(s=>/^Page\r?\n/.test(s));if(!section)return null
 const raw=section.match(/^- Page URL: (.+)$/m)?.[1]?.trim(),title=section.match(/^- Page Title: (.*)$/m)?.[1]?.trim()||''
 if(!raw||!displayUrl(raw))return null
 return {url:displayUrl(raw),title:title.slice(0,300),blank:raw==='about:blank',placeholder:looksLikeDefaultSite(value),redirected:false,httpStatus:null,verified:raw!=='about:blank'}
}
export function browserResultText(value:string){return value.startsWith(prefix)?value.slice(value.indexOf('\n')+1):value}
export function browserJobPresentation(job:{status:string;result:string;error?:string},tool:string,target='',allowedOrigins:readonly string[]=[]){
 const page=browserPageFromResult(job.result),blank=page?.blank===true||/browser_no_open_page/.test(job.result+' '+job.error)
 const result={title:'尚未核实网页',detail:'尚未收到可核验的网页结果。',tone:'info' as 'info'|'warning'|'error'|'success',page,canOpenTarget:false}
 if(job.status==='queued')return {...result,title:'已批准，等待本机连接器领取',detail:'连接器需保持运行。此时尚未开始网页跳转，请勿重复点击。'}
 if(job.status==='running')return {...result,title:tool==='browser.browser_navigate'?'正在打开目标网页':'正在读取当前页面',detail:tool==='browser.browser_navigate'?'正在等待网页跳转及实际页面回执；弹出 Chrome 不代表网页已打开。':'本操作只读取当前受控页面，不会访问目标输入框中的网址。'}
 if(job.status==='cancelled')return {...result,title:'本次操作已停止',detail:'已停止等待；此前已经发出的网页请求不一定能够撤销。重新访问仍需你确认。'}
 if(['unknown','expired'].includes(job.status))return {...result,title:'网页结果尚未确认',tone:'warning' as const,detail:'尚未取得可信回执，请核查本机。不会自动重放请求。'}
 if(blank)return {...result,title:'尚未打开网页',tone:'warning' as const,detail:browserNavigationHint('browser_no_open_page'),canOpenTarget:!!target.trim()}
 if(job.status==='failed')return {...result,title:'没有确认打开目标网页',tone:'error' as const,detail:browserNavigationHint(job.result+' '+job.error),canOpenTarget:!!target.trim()}
 if(job.status!=='succeeded')return result
 if(!page?.verified)return {...result,title:'已收到回执，实际网址未核实',tone:'warning' as const,detail:'不能仅凭工具返回成功就认定目标网页打开。请检查原始回执或更新连接器。'}
 if(allowedOrigins.length&&!allowedOrigins.includes(new URL(page.url).origin))return {...result,page:null,title:'实际网址不在当前授权范围',tone:'error' as const,detail:'本次结果不能作为目标网站已打开的证明，请核对本机网站授权。'}
 if(page.httpStatus!==null&&page.httpStatus>=400)return {...result,title:'网站返回了错误页面',tone:'error' as const,detail:'HTTP '+page.httpStatus+'，请检查网站服务与地址。'}
 if(page.placeholder)return {...result,title:'已访问，但这是站点默认页',tone:'warning' as const,detail:'页面显示“恭喜，站点创建成功”，尚不是业务系统。请核对该域名的站点目录、端口或反向代理；重装连接器不能替代网站部署。'}
 if(tool==='browser.browser_navigate')return {...result,title:page.redirected?'已打开跳转后的网页':'目标网页已打开',tone:'success' as const,detail:page.redirected?'目标网站发生了已授权的跳转，请核对下方实际网址。':'已收到实际页面地址与内容回执；没有自动填写或提交表单。'}
 const different=!!target&&displayUrl(target)!==page.url
 return {...result,title:different?'已读取当前页，未跳转到输入网址':'已读取当前网页',tone:'success' as const,detail:different?'下方实际网址才是本次读取的页面。要访问输入框里的网址，请点击“打开目标网页”。':'这里只读取页面内容；输入框的目标网址不会自动执行。',canOpenTarget:different}
}

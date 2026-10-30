// Browser-only bounded diagnostics. Never expose raw request headers or network error stacks.
export const BROWSER_RECEIPT_PREFIX='STUDIO_BROWSER_PAGE_V1:'
export const BROWSER_EVENT_PREFIX='STUDIO_BROWSER_EVENT '
export function safeBrowserUrl(raw){
 try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return ['about:blank','about:srcdoc'].includes(raw)?raw:'';u.username='';u.password='';u.search='';u.hash='';return u.href.slice(0,2000)}catch{return ''}
}
export function browserFailureCode(value){
 const text=String(value?.cause||value?.message||value||'').toLowerCase()
 if(/err_name_not_resolved|err_name_resolution_failed|enotfound|eai_again/.test(text))return 'browser_dns_failed'
 if(/err_connection_refused|econnrefused/.test(text))return 'browser_connection_refused'
 if(/err_cert|certificate|ssl|tls/.test(text))return 'browser_tls_failed'
 if(/timed out|timeout|etimedout|err_timed_out/.test(text))return 'browser_navigation_timeout'
 if(/blockedbyclient|err_blocked_by_client|browser_origin_denied/.test(text))return 'browser_origin_denied'
 if(/target.*closed|page.*closed|browser.*closed/.test(text))return 'browser_page_closed'
 return 'browser_navigation_failed'
}
export const BROWSER_FAILURE_MESSAGES={
 browser_no_open_page:'独立浏览器尚未打开网页。已阻止把空白页当作成功结果；请先在工作台填写网址并点击“打开目标网页”。读取当前页面不会访问输入框中的网址。',
 browser_page_unverified:'工具已返回，但没有取得可核验的实际网页地址，不能认定目标网页已打开。请检查本次回执。',
 browser_dns_failed:'目标域名无法解析。请检查被连接电脑的 DNS / hosts；网站授权不会自动配置域名。',
 browser_connection_refused:'目标服务拒绝连接。请核对网页地址、端口和网站服务；无需重新配对电脑。',
 browser_tls_failed:'网页 HTTPS/TLS 或证书校验失败。不会自动忽略证书或切换协议，请核对网址与服务配置。',
 browser_navigation_timeout:'打开目标网页超时，尚未取得可核验的页面内容。不会自动重试，请核对网站和网络。',
 browser_origin_denied:'目标网页或跳转地址不在本机已授权网站范围内，已阻止访问；请由本人核对并调整授权。',
 browser_page_closed:'受控页面或浏览器已关闭。请重新打开目标网址；不会复制日常浏览器的登录信息。',
 browser_navigation_failed:'没有确认打开目标网页。请检查网站、网络及授权；不会把空白页或浏览器启动当作打开成功。',
 browser_http_error:'已连接目标服务器，但它返回了 HTTP 错误页面；不是业务网页加载成功。',
}
export function browserPage(text){
 const sections=String(text||'').split(/^### /m),section=sections.find(s=>/^Page\r?\n/.test(s))
 if(!section)return null
 const raw=section.match(/^- Page URL: (.+)$/m)?.[1]?.trim(),title=section.match(/^- Page Title: (.*)$/m)?.[1]?.trim()||''
 if(!raw)return null
 return {rawUrl:raw,url:safeBrowserUrl(raw),title:title.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,300)}
}
export function browserObservation(text,{origins,requestedUrl='',httpStatus}={}){
 const page=browserPage(text)
 if(!page)throw Error('browser_page_unverified')
 if(['about:blank','about:srcdoc'].includes(page.rawUrl))throw Error('browser_no_open_page')
 let u;try{u=new URL(page.rawUrl)}catch{throw Error('browser_page_unverified')}
 if(!['http:','https:'].includes(u.protocol))throw Error('browser_navigation_failed')
 if(!origins?.includes(u.origin)||u.username||u.password)throw Error('browser_origin_denied')
 if(httpStatus>=400)throw Error('browser_http_error')
 return {version:1,url:page.url,title:page.title,requestedUrl:safeBrowserUrl(requestedUrl),redirected:!!requestedUrl&&page.rawUrl!==new URL(requestedUrl).href,httpStatus:Number.isInteger(httpStatus)?httpStatus:null,placeholder:/恭喜，站点创建成功|这是默认index\.html|default index\.html/i.test(text)}
}
export function browserReceipt(observation,text){return BROWSER_RECEIPT_PREFIX+JSON.stringify(observation)+'\n'+String(text).slice(0,10500)}

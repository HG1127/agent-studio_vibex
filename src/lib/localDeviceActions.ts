import type {LocalTool} from './localDevices'

export const LOCAL_ACTION_NAMES:Record<string,string>={
  'connector.open_permissions':'打开本机授权管理',
  'files.list':'浏览文件夹','files.read':'查看文本文件','files.write':'新建文本文件',
  'files.stat':'核对文件版本','files.update':'保存文本修改','files.mkdir':'新建文件夹',
  'files.copy':'复制文件','files.move':'移动或重命名文件','files.trash':'移入可恢复回收区',
  'files.trash_list':'查看回收记录','files.restore':'恢复文件','files.open':'用电脑软件打开文件','files.reveal':'在电脑中定位文件',
  'browser.browser_navigate':'打开网页','browser.browser_snapshot':'读取当前网页',
  'browser.browser_take_screenshot':'查看网页截图','browser.browser_click':'点击网页元素',
  'browser.browser_type':'填写网页内容','browser.browser_fill_form':'填写表单',
  'browser.browser_select_option':'选择下拉选项','browser.browser_press_key':'网页按键',
  'browser.browser_tabs':'管理浏览器标签','browser.browser_close':'关闭独立浏览器',
  'browser.browser_wait_for':'等待网页内容','apps.launch':'打开已授权的软件',
  'office.table_summary':'汇总表格','office.create_report':'生成办公报告',
  'desktop.Screenshot':'查看桌面截图','desktop.Snapshot':'读取桌面状态',
  'desktop.Click':'点击桌面','desktop.Type':'输入文字','desktop.Scroll':'滚动桌面',
  'desktop.ControlStatus':'检查桌面控制状态',
}
export function localActionName(name:string){return LOCAL_ACTION_NAMES[name]||'扩展工具（'+name+'）'}
export function localRelativePath(input:string,file=false):string{
  const value=input.trim().replaceAll('\\','/')
  if(!value||value.length>1000||value.startsWith('/')||/[:\x00-\x1f\x7f]/.test(value))throw Error('请使用授权文件夹内的相对位置，不要填写盘符、绝对路径或控制字符。')
  const parts=value.split('/')
  if(parts.some(p=>!p||p==='..'||(p!=='.'&&(p.endsWith('.')||p.endsWith(' ')))))throw Error('只能访问当前授权目录内的内容，不能使用上级目录或不明确的路径。')
  const normalized=parts.filter(p=>p!=='.').join('/')||'.'
  if(file&&normalized==='.')throw Error('这里需要具体文件名，请从文件列表选择文件；文件夹不能当作文本文件读取。')
  return normalized
}
export function localChildPath(parent:string,name:string):string{
  if(!name||name==='.'||name==='..'||/[\\/:\x00-\x1f\x7f]/.test(name))throw Error('文件名称不符合安全要求。')
  return localRelativePath(parent==='.'?name:parent+'/'+name)
}
export function localParentPath(value:string){const p=localRelativePath(value).split('/');p.pop();return p.join('/')||'.'}
export function localWebAddress(input:string):string{
  let url:URL
  try{url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(input.trim())?input.trim():'https://'+input.trim())}catch{throw Error('请填写网站地址，例如 https://example.com。')}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash)throw Error('仅支持不含密码、查询参数或访问令牌的普通网页地址。')
  return url.href
}
export function localRootOptions(tool?:LocalTool):{id:string;label:string}[]{
  const p=tool?.inputSchema.properties as {root?:{enum?:unknown[];oneOf?:{const?:unknown;title?:unknown}[]}}|undefined
  const values=Array.isArray(p?.root?.enum)?p.root.enum:[]
  const titles=Array.isArray(p?.root?.oneOf)?p.root.oneOf:[]
  return values.filter((x):x is string=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,30}$/.test(x)).map(id=>{
    const declared=titles.find(row=>row&&row.const===id)?.title
    return {id,label:typeof declared==='string'?declared.slice(0,160):id==='work'?'工作文件夹（本机授权）':id}
  })
}
export function localFileListing(text:string,root:string,path:string):{entries:{name:string;directory:boolean}[];truncated:boolean}|null{
  try{
    const value=JSON.parse(text)
    if(value.root!==root||value.path!==path||!Array.isArray(value.entries))return null
    const entries=value.entries.slice(0,200).filter((e:unknown):e is {name:string;directory:boolean}=>!!e&&typeof e==='object'&&typeof (e as {name?:unknown}).name==='string'&&typeof (e as {directory?:unknown}).directory==='boolean')
      .filter((e:{name:string})=>{try{localChildPath(path,e.name);return true}catch{return false}})
    return {entries,truncated:value.truncated===true}
  }catch{return null}
}
export function localTextPreviewable(name:string){return /\.(txt|md|csv|json|log|yaml|yml|xml|html|css)$/i.test(name)}
export function localDefaultArguments(tool:string,root='work'):string{
  return JSON.stringify(tool==='files.list'?{root,path:'.'}:tool==='files.read'?{root,path:''}:tool==='files.write'?{root,path:'新文件.txt',text:''}:tool==='browser.browser_navigate'?{url:''}:{},null,2)
}

/** Reordering an identical server catalog is not a permission change and must
 * not remount a form with unsaved text. Real root/tool/origin changes still
 * produce a different identity so stale selections cannot cross scopes. */
export function localToolCatalogKey(tools:readonly LocalTool[]):string{
  const ordered=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(ordered)
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort()
      .map(key=>[key,ordered((value as Record<string,unknown>)[key])]))
    return value
  }
  return JSON.stringify(tools.map(tool=>({name:tool.name,inputSchema:ordered(tool.inputSchema)}))
    .sort((a,b)=>a.name.localeCompare(b.name)))
}

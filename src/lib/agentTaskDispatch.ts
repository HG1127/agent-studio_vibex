export type DispatchCapability = {
 id:string
 label:string
 available:boolean
 candidates:string[]
 sideEffect:boolean
 guidance:string
 sequence:number
 dependsOn:string[]
}
export type DispatchContext = {
 enabledBuiltins:readonly string[]
 connectedTools:readonly {name:string;description?:string;status?:string;method?:string}[]
 marketTools:readonly {id:string;name?:string;description?:string;readOnly?:boolean;destructive?:boolean}[]
 localTools:readonly string[]
 localDeviceOnline:boolean
}
const normalize=(value:string)=>value.trim().toLowerCase()
/** Advisory plan only. It never grants a tool, changes an AgentSpec or starts work. */
export function buildAgentTaskDispatch(instruction:string,context:DispatchContext):DispatchCapability[]{
 const text=normalize(instruction)
 if(!text)return []
 const enabled=new Set(context.enabledBuiltins)
 const connected=context.connectedTools.filter(t=>t.status==='ok')
 const market=context.marketTools
 const local=new Set(context.localDeviceOnline?context.localTools:[])
 const rows:Omit<DispatchCapability,'sequence'|'dependsOn'>[]=[]
 const builtin=(name:string)=>enabled.has(name)
 const plugin=(names:string[])=>market.some(t=>names.some(n=>normalize(t.name||'')===normalize(n)||normalize(t.id)===normalize(n)))
 const localAll=(names:string[])=>context.localDeviceOnline&&names.every(name=>local.has(name))
 const add=(id:string,label:string,candidates:string[],sideEffect=false,guidance='',available=false)=>{
  rows.push({id,label,available,candidates,sideEffect,guidance:guidance||(available?'已匹配候选能力；实际执行仍以运行时权限校验和调用回执为准。':'缺少已验证的可用能力；不会自动连接或扩大权限。')})
 }
 const hasResearch=/搜索|调研|研究|最新|新闻|网页|来源|search|research|browse|website|latest/.test(text)
 const hasFiles=/文件|文件夹|目录|读取|编辑|保存|新建|删除|重命名|移动|pdf|word|excel|表格|文档|图片|file|folder|document|spreadsheet/.test(text)
 const hasCalc=/计算|合计|求和|统计|百分比|公式|calculate|sum|formula|percentage/.test(text)
 const hasKnowledge=/知识库|内部资料|公司资料|内部文档|knowledge base|internal docs/.test(text)
 const hasOpen=/打开|启动|用.*软件|open|launch/.test(text)
 const hasWrite=/编辑|保存|新建|删除|重命名|移动|写入|修改|创建|edit|save|create|delete|rename|move|write/.test(text)
 const hasDelete=/删除|移入回收|delete|trash/.test(text)
 const hasMove=/重命名|移动|rename|move/.test(text)
 const hasCreate=/新建|创建文件|create file/.test(text)
 if(hasResearch){
  const available=builtin('web_search')||builtin('web_fetch')||plugin(['browser_navigate','browser_snapshot','web_search','search'])
  add('web','联网搜索与来源核验',['web_search','web_fetch','browser.browser_navigate','browser.browser_snapshot'],false,'优先使用当前 Agent 已启用的联网工具；运行时会记录实际工具名与返回结果。',available)
 }
 if(hasKnowledge){
  add('knowledge','内部知识检索',['knowledge_search'],false,'只检索当前 Agent 已关联且当前用户有权访问的知识库。',builtin('knowledge_search'))
 }
 if(hasFiles){
  const required=['files.list','files.read']
  if(hasOpen)required.push('files.open')
  if(hasDelete)required.push('files.trash')
  else if(hasMove)required.push('files.move')
  else if(hasCreate)required.push('files.write')
  else if(hasWrite)required.push('files.update')
  const available=localAll(required)
  const label=hasDelete?'本机文件删除（可恢复）':hasMove?'本机文件移动 / 重命名':hasCreate?'本机新建文件':hasWrite?'本机文件编辑与保存':hasOpen?'读取并打开本机文件':'本机文件读取'
  add('local-files',label,required,hasWrite||hasDelete||hasMove||hasCreate,
   '需要选中的电脑在线，目标目录必须位于已授权目录内，并单独授权这一具体动作；写入、移动和删除在执行前需确认。',available)
 }
 if(hasOpen&&!hasFiles){
  add('desktop-app','打开本机应用',['apps.launch'],true,'只允许连接器公开且经授权的应用操作；不执行任意 shell 或脚本。',localAll(['apps.launch']))
 }
 if(hasCalc)add('calculation','数值计算',['calculate'],false,'使用已启用的计算能力；计算结果会在运行轨迹中显示。',builtin('calculate'))
 if(/总结|摘要|归纳|改写|提炼|summarize|rewrite|extract/.test(text))
  add('summarize','文本整理与摘要',['summarize'],false,'仅处理任务中提供或已授权读取的内容。',builtin('summarize'))
 if(/发送|发邮件|提交|发布|下单|付款|更新系统|删除记录|send|email|submit|publish|purchase|payment/.test(text)){
  const targetPattern=/邮件|email|mail/.test(text)?/mail|email|send_message|send_mail/:
   /付款|下单|purchase|payment|checkout/.test(text)?/pay|order|checkout|payment/:
   /删除记录|删除数据|delete record|delete data/.test(text)?/delete|remove|trash/:
   /发布|publish/.test(text)?/publish|release/:
   /提交|submit/.test(text)?/submit|create|write/:
   /更新|update/.test(text)?/update|write|patch/:
   /发送|send/.test(text)?/send|message|notification|mail/:
   /报告|report/.test(text)?/report|document|write|create/:/write|create|submit|publish/
  const writeConnections=connected.filter(t=>String(t.method||'').toUpperCase()!=='GET'&&targetPattern.test(t.name+' '+String(t.description||'')))
  const writePlugins=market.filter(t=>t.readOnly!==true&&targetPattern.test(t.id+' '+String(t.name||'')+' '+String(t.description||'')))
  const available=writeConnections.length>0||writePlugins.length>0
  add('external-write','外部写入或提交',[...writeConnections.map(t=>t.name),...writePlugins.map(t=>t.id)],true,
   '副作用操作必须核验具体目标与参数，并在本次调用前取得本人审批；只读连接不能执行写入。无法核验时停止。',available)
 }
 const unique=rows.filter((row,index)=>rows.findIndex(other=>other.id===row.id)===index)
 const ordered=unique.sort((a,b)=>{
  const rank:Record<string,number>={web:10,knowledge:20,'local-files':30,'desktop-app':40,calculation:50,summarize:60,'external-write':90}
  return (rank[a.id]||70)-(rank[b.id]||70)
 })
 return ordered.map((row,index)=>({
  ...row,sequence:index+1,
  dependsOn:index===0?[]:ordered.slice(0,index).filter(previous=>row.id==='external-write'||row.id==='calculation'&&['web','knowledge','local-files'].includes(previous.id)||row.id==='local-files'&&previous.id==='web').map(previous=>previous.id)
 }))
}

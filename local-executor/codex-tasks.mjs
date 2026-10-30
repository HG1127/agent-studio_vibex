import {randomBytes} from 'node:crypto'
import path from 'node:path'
import {spawn} from 'node:child_process'

export function codexTaskArguments(directory,write){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||typeof write!=='boolean')throw Error('invalid_application_workspace')
 return ['--ask-for-approval','never','exec','--json','--sandbox',write?'workspace-write':'read-only','--cd',directory,'-']
}
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false})
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw Error('invalid_application_arguments')}
export function createCodexTasks({grants,roots,checked,confirm,launch,addTool}){
 const tasks=new Map(),allowed=new Map(grants.map(g=>[g.id,g]))
 let starting=false,closed=false
 const workspaces=(roots||[]).filter(r=>!r.allowedFiles),rootMap=new Map(workspaces.map(r=>[r.name,r]))
 const apps={type:'string',enum:grants.map(g=>g.id)},id={type:'string',pattern:'^[a-f0-9]{32}$'}
 const publicTask=t=>({id:t.id,app:t.app,workspace:t.root,status:t.status,write:t.write,startedAt:t.startedAt,finishedAt:t.finishedAt||null,result:t.output.slice(-4000),error:t.error||null})
 const stop=async t=>{
  if(t.status!=='running')return
  t.status='cancelled';t.finishedAt=Date.now();clearTimeout(t.timer)
  if(t.child?.pid){if(process.platform==='win32')await new Promise(resolve=>{const child=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(t.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});child.once('error',resolve);child.once('exit',resolve)});else t.child.kill('SIGTERM')}
 }
 if(grants.length&&workspaces.length){
  addTool('apps.task_start','向已授权的 Codex CLI 提交任务，立即返回本机任务编号，使用 task_status 查看进度。使用已有软件登录，可能消耗模型额度；必须本机确认。默认只读；禁止完全访问沙箱或任意命令行。',{app:apps,root:{type:'string',enum:workspaces.map(r=>r.name)},prompt:{type:'string',maxLength:8000},write:{type:'boolean'}},async(args,signal)=>{
   if(starting||closed)throw Error('application_task_busy');starting=true
   try{
   exact(args,['app','root','prompt','write']);const g=await checked(args.app),workspace=rootMap.get(args.root)
   if(!allowed.has(g.id)||!workspace||typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>8000||typeof args.write!=='boolean'||args.write&&(!g.allowWrite||workspace.readOnly===true))throw Error('application_task_denied')
   if([...tasks.values()].some(t=>t.status==='running')||tasks.size>=30)throw Error('application_task_busy')
   if(!await confirm({kind:'application',message:'软件：'+g.name+'\n工作目录：'+workspace.path+'\n权限：'+(args.write?'允许修改此工作目录':'只读分析')+'\n任务：'+args.prompt+'\n会使用该软件已有登录，可能产生模型费用。结果将返回工作台；外部软件不继承文件工具的细分权限。确认后启动，可在工作台停止。'},signal))throw Error('application_action_declined')
   signal?.throwIfAborted();if(closed)throw Error('application_task_busy');await checked(g.id)
   signal?.throwIfAborted();if(closed)throw Error('application_task_busy')
   const t={id:randomBytes(16).toString('hex'),app:g.id,root:args.root,write:args.write,status:'running',startedAt:Date.now(),output:'',error:'',child:null}
   tasks.set(t.id,t)
   let child
   try{child=launch(g.path,codexTaskArguments(workspace.path,args.write),{cwd:workspace.path,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});t.child=child}catch{t.status='failed';t.error='本机 Codex CLI 未能启动。';t.finishedAt=Date.now();return JSON.stringify(publicTask(t))}
   child.stdin.on('error',()=>{t.error='任务输入未能传入本机 Codex CLI。'})
   t.timer=setTimeout(()=>void stop(t),30*60*1000);t.timer.unref();
   let pending='';child.stdout.on('data',b=>{pending=(pending+String(b)).slice(-128000);const lines=pending.split(/\r?\n/);pending=lines.pop()||'';for(const line of lines){try{const e=JSON.parse(line);if(e.type==='item.completed'&&e.item?.type==='agent_message'&&typeof e.item.text==='string')t.output=(t.output+'\n'+e.item.text).slice(-10000);if(e.type==='turn.failed'||e.type==='error')t.error='Codex 报告任务失败，请在本机核查软件登录、额度和任务条件。'}catch{}}})
   child.stderr.on('data',()=>{}) // Never copy auth/config diagnostics or arbitrary command output to the employee UI.
   child.once('error',()=>{clearTimeout(t.timer);t.status='failed';t.error='本机 Codex CLI 未能启动。';t.finishedAt=Date.now()})
   child.once('close',code=>{clearTimeout(t.timer);if(t.status==='running'){t.status=code===0&&!t.error?'succeeded':'failed';t.finishedAt=Date.now();if(t.status==='failed'&&!t.error)t.error='Codex 执行未成功。请检查软件登录、工作目录是否为 Git 仓库及模型配置。'}})
   child.stdin.end(args.prompt)
   return JSON.stringify(publicTask(t))
   }finally{starting=false}
  })
  addTool('apps.task_status','查询此连接本次启动的 Codex 任务，返回运行状态与软件实际给出的最终结果。',{app:apps,task:id},async args=>{exact(args,['app','task']);await checked(args.app);const t=tasks.get(args.task);if(!t||t.app!==args.app)throw Error('application_task_not_found');return JSON.stringify(publicTask(t))})
  addTool('apps.task_list','列出此连接本次启动的 Codex 任务编号和状态；页面刷新后可重新选择任务查看或停止，不会重新提交任务。',{app:apps},async args=>{exact(args,['app']);await checked(args.app);return JSON.stringify({tasks:[...tasks.values()].filter(t=>t.app===args.app).map(t=>({id:t.id,status:t.status,workspace:t.root,startedAt:t.startedAt,write:t.write}))})})
  addTool('apps.task_cancel','停止此连接启动的 Codex 任务。已产生的文件变更不会自动撤销。',{app:apps,task:id},async(args,signal)=>{exact(args,['app','task']);await checked(args.app);const t=tasks.get(args.task);if(!t||t.app!==args.app)throw Error('application_task_not_found');if(t.status==='running'&&!await confirm({kind:'application',message:'停止 Codex 任务 '+t.id+'？已发生的修改不会自动撤销。'},signal))throw Error('application_action_declined');await stop(t);return JSON.stringify(publicTask(t))})
 }
 return {close:async()=>{closed=true;await Promise.allSettled([...tasks.values()].map(stop));tasks.clear()}}
}

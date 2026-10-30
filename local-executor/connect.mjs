#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {createInterface} from 'node:readline/promises'
import {spawn} from 'node:child_process'
import {prepareGuidedConnection} from './setup.mjs'
import {chooseWorkspace,changeGuidedWorkspace,pickConnectionFile} from './workspace.mjs'
import {chooseGuidedProfile} from './profiles.mjs'
import {changeGuidedBrowser} from './browser-settings.mjs'
import {connectionFailureHint} from './connection-feedback.mjs'
const args=process.argv.slice(2),home=os.homedir(),script=path.join(path.dirname(fileURLToPath(import.meta.url)),'run.mjs')
const prompt=createInterface({input:process.stdin,output:process.stdout})
try{
  let configFile
  if(args[0]==='--manage'){
    if(args.length!==1)throw Error('invalid_profile_selection')
    const selected=await chooseGuidedProfile(prompt,{home})
    if(selected.kind==='cancel'){console.log('已退出，没有连接或修改设备。');prompt.close();process.exit(0)}
    args.splice(0,args.length,...(selected.kind==='new'?['--open']:[selected.kind==='folder'?'--folder':selected.kind==='chrome'?'--chrome':'--resume',selected.id]))
  }
  if(args[0]==='--chrome'){
    if(args.length!==2)throw Error('invalid_resume_id')
    const updated=await changeGuidedBrowser(args[1],{home,confirm:async scope=>{
      console.log('\n连接：'+scope.name+'\n服务器：'+scope.server+'\n即将改用 Google Chrome 独立会话。')
      console.log('保留原设备、目录和网站权限。不导入日常浏览器密码或 Cookie，不自动启动任务。')
      return /^(y|yes|是)$/i.test((await prompt.question('确认切换此连接的浏览器？输入 y：')).trim())
    }})
    console.log(updated.cancelled?'已取消，原浏览器配置未改变。':updated.changed?'已改用 Google Chrome。请恢复原连接，无需重新绑定。':'此连接已经使用 Google Chrome，无需修改。')
    prompt.close();process.exit(0)
  }
  if(args[0]==='--folder'){
    if(args.length!==2)throw Error('invalid_resume_id')
    const updated=await changeGuidedWorkspace(args[1],{home,choose:scope=>chooseWorkspace(prompt,scope),confirm:async scope=>{
      console.log('\n原目录：'+scope.previous+'\n新目录：'+scope.workspace+'\n权限：'+(scope.readOnly?'只读，不修改文件':'允许读取和新建文件，不覆盖已有文件'))
      console.log('旧目录的待执行文件操作不会转移到新目录。请确认已停止之前的连接器。')
      return /^(y|yes|是)$/i.test((await prompt.question('确认更换本机授权目录？输入 y：')).trim())
    }})
    console.log(updated.cancelled?'已取消，原目录和权限未改变。':'目录已更新，未执行任务。请启动原设备：pnpm local:connect --resume '+args[1])
    prompt.close()
    process.exit(0)
  }
  if(args[0]==='--resume'){
    if(args.length!==2||!/^[A-Za-z0-9]{24}$/.test(args[1]))throw Error('invalid_resume_id')
    configFile=path.join(home,'.agent-studio','connections',args[1],'computer.local.json')
    await fs.access(configFile)
    console.log('恢复本机已有连接，仍沿用原有网站与文件权限。')
  }else{
    if(args.length>1)throw Error('使用 pnpm local:connect [连接文件路径]')
    const defaultFile=path.join(home,'Downloads','agent-studio-connect.json')
    const opened=args[0]==='--open'?await pickConnectionFile():null
    if(args[0]==='--open'&&!opened)throw Error('connection_selection_cancelled')
    const chosen=opened||args[0]||(await prompt.question('连接文件路径（可拖入刚下载的文件，回车使用下载目录默认文件）：')).trim()||defaultFile
    const ticketFile=path.resolve(chosen.replace(/^["']|["']$/g,'')),stat=await fs.lstat(ticketFile)
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>16000)throw Error('invalid_connection_file')
    const input=JSON.parse(await fs.readFile(ticketFile,'utf8'))
    const result=await prepareGuidedConnection(input,{chooseWorkspace:scope=>chooseWorkspace(prompt,scope),confirm:async scope=>{
      console.log('\n电脑名称：'+scope.name+'\n连接服务器：'+scope.server+'\n授权用途：'+({browser:'仅浏览器',files:'文件与表格',both:'浏览器与文件'})[scope.mode])
      console.log(scope.mode==='browser'?'文件能力：关闭':'授权工作文件夹：'+scope.workspace+'（'+(scope.readOnly?'只读':'允许读取和新建，不覆盖')+'）')
      console.log('自动化浏览器：'+(scope.mode==='files'?'关闭':'Google Chrome（独立会话）'))
      console.log('允许访问的网站：'+(scope.origins.join('、')||'浏览器关闭'))
      console.log('不接管日常浏览器，不开放桌面控制，不安装后台服务。每项实际操作仍需在网页批准。')
      return /^(y|yes|是)$/i.test((await prompt.question('确认这是你自己的账号和授权范围？输入 y 继续：')).trim())
    }})
    configFile=result.configFile
    console.log('连接配置已保存。下次恢复使用：pnpm local:connect --resume '+result.id)
  }
  prompt.close()
  const child=spawn(process.execPath,[script,'run',configFile],{stdio:'inherit',shell:false,windowsHide:false})
  child.once('error',()=>{console.error('启动失败，请检查本地 Node.js 和项目依赖。');process.exitCode=1})
  child.once('exit',code=>{process.exitCode=code??1})
}catch(error){
  prompt.close()
  const known={chrome_not_installed:'未找到 Google Chrome。请安装 Chrome 后再启动；没有切换到 Edge，也没有消耗连接凭证。',browser_not_enabled:'此连接未开启浏览器能力，不能通过切换浏览器扩大授权。',invalid_profile_selection:'请选择列表中存在的编号，或回车退出；没有启动或修改任何连接。',local_credentials_unavailable:'原连接的本机凭据缺失或不可验证，请先核查，不要重复绑定。',invalid_local_config:'本机配置不完整或不受支持，请使用原手工方式并核对范围。',connection_selection_cancelled:'已取消选择连接文件，没有绑定设备。',connection_picker_unavailable:'文件选择窗口不可用，请使用 pnpm local:connect 并粘贴下载文件路径。',workspace_selection_cancelled:'已取消目录选择，没有继续配对。',workspace_choice_invalid:'请选择 1 或 2；未扩大目录权限。',folder_picker_unavailable:'文件夹窗口不可用，请重新运行并选择 2 粘贴目录路径。',workspace_must_be_local_absolute:'请选择本机已有文件夹的完整路径，暂不支持网络共享地址。',workspace_too_broad_or_private:'请选择具体工作子文件夹，不能授权整盘、用户主目录、系统或凭证目录。',workspace_link_or_not_directory:'目录不存在、不是文件夹或包含链接，请选择真实文件夹。',connection_running_or_locked:'连接器仍在运行或目录锁未核实。先在原终端 Ctrl+C 停止，再更换目录；不要重复启动。',browser_only_no_file_scope:'这是仅浏览器连接，不能通过更换目录直接开启文件权限。请明确选择文件用途重新配置。',local_config_changed:'本地配置已被其他操作更改，未覆盖。请核对后重试。',connection_not_confirmed:'已取消，没有配对或执行任务。',device_already_paired_use_resume:'这台设备已有本地连接，请使用恢复命令，不要重复配对。',linked_setup_directory_denied:'本地配置目录是链接或不是文件夹，已拒绝写入。',ENOENT:'未找到连接文件或本地组件。请检查下载文件路径和项目依赖。'}
  console.error(known[error.code]||known[error.message]||connectionFailureHint(error)||String(error.message))
  process.exitCode=1
}

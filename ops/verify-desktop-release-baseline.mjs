import fs from 'node:fs/promises'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{compare}=require('../desktop/update-core.cjs')
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export async function verifyDesktopReleaseBaseline(root=project){
 const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'))
 const [baseline,info,pkg]=await Promise.all([read('desktop/release-baseline.json'),read('desktop/build-info.json'),read('desktop/package.json')])
 if(info.version!==pkg.version||compare(info.version,baseline.minimumDesktopVersion)<0)throw Error('桌面版本不符合最新统一发布基线')
 if(!Array.isArray(baseline.requiredAncestors)||!baseline.requiredAncestors.length)throw Error('缺少已验收桌面基线提交')
 for(const commit of baseline.requiredAncestors){
  if(!/^[a-f0-9]{40}$/.test(commit))throw Error('桌面基线提交格式无效')
  try{execFileSync('git',['merge-base','--is-ancestor',commit,'HEAD'],{cwd:root,stdio:'pipe',windowsHide:true})}
  catch{throw Error('必须从最新已验收桌面基线继续开发；缺少提交 '+commit+'。请使用 main 或 '+baseline.branch+'，并获取完整 Git 历史。')}
 }
 for(const file of baseline.requiredFiles){
  const target=path.resolve(root,file);if(!target.startsWith(path.resolve(root)+path.sep))throw Error('桌面基线文件越界')
  await fs.access(target)
 }
 return {status:'PASS',version:info.version,requiredAncestors:baseline.requiredAncestors}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('DESKTOP_BASELINE '+JSON.stringify(await verifyDesktopReleaseBaseline()))

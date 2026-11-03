import fs from 'node:fs/promises'
import path from 'node:path'
export const isQoderHelper=file=>typeof file==='string'&&path.win32.basename(file).toLowerCase()==='qoder launcher.exe'
// Qoder's small per-user helper needs a shortcut working directory and owns no
// editor window. Discover the actual executable for explicit permission review;
// never redirect an already-saved grant to another executable at runtime.
export function shortcutApplicationPath(file,workingDirectory){
 if(!isQoderHelper(file))return file
 if(typeof workingDirectory!=='string'||workingDirectory.length>2000||!/^[a-z]:\\/i.test(workingDirectory)||/[\x00-\x1f\x7f"<>|?*]/.test(workingDirectory))return null
 let directory=path.win32.normalize(workingDirectory)
 if(/^\d+\.\d+\.\d+$/.test(path.win32.basename(directory))&&path.win32.basename(path.win32.dirname(directory))==='.qoder-versions')directory=path.win32.dirname(path.win32.dirname(directory))
 return path.win32.join(directory,'Qoder.exe')
}
// Resolve updater targets only while saving explicit application permission.
export function allowedWindowTarget(launcher,target){
 const relative=path.win32.relative(path.win32.dirname(launcher),target),parts=relative.split('\\')
 return parts.length===3&&parts[0]==='.qoder-versions'&&/^\d+\.\d+\.\d+$/.test(parts[1])&&parts[2].toLowerCase()===path.win32.basename(launcher).toLowerCase()
}
export async function resolveWindowTarget(launcher){
 const directory=path.join(path.dirname(launcher),'.qoder-versions')
 const entries=await fs.readdir(directory,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e})
 const ready=new Set(entries.filter(e=>e.isFile()&&e.name.endsWith('.qoder-update-ready.json')).map(e=>e.name.slice(0,-24)))
 const versions=entries.filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&/^\d+\.\d+\.\d+$/.test(e.name)&&ready.has(e.name)).sort((a,b)=>b.name.localeCompare(a.name,'en',{numeric:true})).slice(0,5)
 for(const version of versions){
  // Downloaded pending ASAR payloads are not active installations. Their ready
  // marker must not redirect window verification away from the running editor.
  let metadata;try{const file=path.join(directory,version.name+'.qoder-update-ready.json');if((await fs.stat(file)).size<=4096)metadata=JSON.parse(await fs.readFile(file,'utf8'))}catch{}
  if(metadata?.payloadLayout==='pending-asar-v1')continue
  const target=path.join(directory,version.name,path.basename(launcher))
  try{if(!allowedWindowTarget(launcher,target)||await fs.realpath(target)!==target)throw Error('application_path_denied');if((await fs.lstat(target)).isFile())return target}catch(e){if(e.code!=='ENOENT')throw e}
 }
 return null
}

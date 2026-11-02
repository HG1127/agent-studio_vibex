import fs from 'node:fs/promises'
import path from 'node:path'
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
  const target=path.join(directory,version.name,path.basename(launcher))
  try{if(!allowedWindowTarget(launcher,target)||await fs.realpath(target)!==target)throw Error('application_path_denied');if((await fs.lstat(target)).isFile())return target}catch(e){if(e.code!=='ENOENT')throw e}
 }
 return null
}

import {localFileListing,localRelativePath} from './localDeviceActions.ts'
export type LocalDirectorySnapshot={root:string;path:string;readAt:number;entries:{name:string;directory:boolean}[];truncated:boolean}
/** An explicit, bounded view of a completed directory read; not live filesystem
 * state. Kept only in component memory for the current device/catalog/owner. */
export function localDirectorySnapshot(text:string,root:string,path:string,now=Date.now()):LocalDirectorySnapshot|null{
  try{
    if(!/^[a-z][a-z0-9_-]{0,30}$/.test(root)||!Number.isFinite(now)||now<=0)return null
    const normalized=localRelativePath(path),parsed=localFileListing(text,root,normalized)
    if(!parsed)return null
    return {...parsed,root,path:normalized,readAt:now,entries:parsed.entries.slice().sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,'zh-CN'))}
  }catch{return null}
}
export function visibleLocalFiles(snapshot:LocalDirectorySnapshot|null,root:string,path:string,query:string){
  if(!snapshot||snapshot.root!==root||snapshot.path!==path)return []
  const term=query.trim().toLocaleLowerCase()
  return snapshot.entries.filter(item=>!term||item.name.toLocaleLowerCase().includes(term))
}

import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {buildConnector} from '../ops/build-connector.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const result=await buildConnector()
const target=path.join(root,'.tmp','desktop-connector')
try {
  const realRoot=await fs.realpath(root),realTarget=await fs.realpath(target)
  const stat=await fs.lstat(target)
  if(stat.isSymbolicLink()||realTarget!==path.join(realRoot,'.tmp','desktop-connector'))throw Error('unsafe_desktop_resource_directory')
  await fs.rm(realTarget,{recursive:true})
} catch(e){if(e.code!=='ENOENT')throw e}
await fs.cp(result.packageRoot,target,{recursive:true,dereference:false,errorOnExist:true})
console.log('DESKTOP_CONNECTOR_RESOURCES_READY '+result.files.length)

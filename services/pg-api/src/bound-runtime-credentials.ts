// Exact systemd credential mounts only. Importing performs no filesystem I/O.
import {readFileSync,lstatSync,realpathSync,accessSync,constants} from "node:fs"
export type BoundServiceKind="model"|"dispatch"|"workflow"
const names:Record<BoundServiceKind,ReadonlySet<string>>={
  model:new Set(["dispatch-ca.pem","dispatch-worker.pem","dispatch-worker.key"]),
  workflow:new Set(["dispatch-ca.pem","dispatch-workflow.pem","dispatch-workflow.key"]),
  dispatch:new Set(["api.secret","identity.secret","broker.secret","model-encryption.secret",
    "dispatch-ca.pem","dispatch-server.pem","dispatch-server.key"]),
}
function refuse():never{throw Error("unsafe_bound_runtime_credential")}
export function boundCredentialDirectory(kind:BoundServiceKind):string{
  if(kind!=="model"&&kind!=="dispatch"&&kind!=="workflow")refuse()
  return "/run/credentials/agentstudio-pg18-"+kind+".service"
}
export function readBoundRuntimeCredential(
  kind:BoundServiceKind,name:string,env:NodeJS.ProcessEnv,uid=process.getuid?.(),
):Buffer{
  const directory=boundCredentialDirectory(kind)
  if(!names[kind].has(name)||!Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     env.CREDENTIALS_DIRECTORY!==directory)refuse()
  const file=directory+"/"+name
  try{
    const folder=lstatSync(directory),stat=lstatSync(file)
    if(!folder.isDirectory()||folder.isSymbolicLink()||(folder.mode&0o022)!==0||
       ![0,uid].includes(folder.uid)||realpathSync(file)!==file||
       !stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>65536)refuse()
    const mode=stat.mode&0o7777
    if(!(stat.uid===uid&&(mode===0o400||mode===0o600))&&
       !(stat.uid===0&&stat.gid===0&&mode===0o440))refuse()
    accessSync(file,constants.R_OK)
    const data=readFileSync(file)
    const after=lstatSync(file)
    if(data.length!==stat.size||after.dev!==stat.dev||after.ino!==stat.ino||
       after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.isSymbolicLink())refuse()
    return data
  }catch{refuse()}
}

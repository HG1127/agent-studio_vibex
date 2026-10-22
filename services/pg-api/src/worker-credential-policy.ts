// Narrow permission policy for PostgreSQL 18 systemd LoadCredential files.
// Metadata and effective read access only; this module never reads the secret.
// No general acceptance of group-readable files outside the fixed unit path.
export type Pg18WorkerKind="prepare"|"model"|"workflow"
export type CredentialMetadata={
  isFile():boolean
  isSymbolicLink():boolean
  mode:number
  uid:number
  gid:number
  size:number
}
export function expectedPg18CredentialFile(kind:Pg18WorkerKind):string{
  if(kind!=="prepare"&&kind!=="model"&&kind!=="workflow")throw Error("unsafe_worker_secret")
  return "/run/credentials/agentstudio-pg18-"+kind+".service/worker.secret"
}
export function pg18CredentialMetadataAccepted(input:{
  kind:Pg18WorkerKind
  env:NodeJS.ProcessEnv
  file:string
  stat:CredentialMetadata
  uid:number|undefined
  canRead:boolean
}):boolean{
  const {kind,env,file,stat,uid,canRead}=input
  if(kind!=="prepare"&&kind!=="model"&&kind!=="workflow"||
     env.AGENT_STUDIO_PG_BAOTA18_ENABLED!=="true"||
     !Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     !canRead||!stat.isFile()||stat.isSymbolicLink()||
     !Number.isSafeInteger(stat.size)||stat.size<32||stat.size>4096||
     !Number.isSafeInteger(stat.uid)||!Number.isSafeInteger(stat.gid))
    return false
  const expected=expectedPg18CredentialFile(kind)
  if(file!==expected||
     env.AGENT_STUDIO_PG_WORKER_PASSWORD_FILE!==expected||
     env.CREDENTIALS_DIRECTORY!==expected.slice(0,-"/worker.secret".length))
    return false
  // Retain setuid/setgid/sticky bits in the comparison: never accept a
  // special-mode file that merely has an otherwise acceptable 0440 mask.
  if(!Number.isSafeInteger(stat.mode))return false
  const mode=stat.mode&0o7777
  // Ordinary private file owned by this exact non-root service account.
  if(stat.uid===uid&&(mode===0o400||mode===0o600))return true
  // systemd 255 may stage root:root 0440, with a narrow POSIX ACL granting
  // the dynamically allocated service UID effective read access.
  // Accept ONLY this exact mode, ownership and service path; not arbitrary
  // group-read, group-write, world-read or external files.
  return stat.uid===0&&stat.gid===0&&mode===0o440
}
export function assertPg18CredentialMetadata(input:Parameters<
  typeof pg18CredentialMetadataAccepted
>[0]):void{
  if(!pg18CredentialMetadataAccepted(input))
    throw Error("unsafe_worker_secret")
}

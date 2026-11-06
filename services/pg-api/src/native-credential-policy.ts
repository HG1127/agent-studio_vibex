// PostgreSQL 18 Native API/Auth service systemd LoadCredential policy.
// Applies ONLY to the two fixed credentials for this exact service unit.
// The caller handles lstat/accessSync, then reads the secret AFTER acceptance.
// Never relax the independent root-vault preflight policy.
export type NativePg18SecretName="api.secret"|"native-auth.secret"|
  "model-encryption.secret"|"model-broker.secret"|"local-executor.secret"
export type NativeSecretMetadata={
  isFile():boolean
  isSymbolicLink():boolean
  uid:number
  gid:number
  mode:number
  size:number
}
export const nativePg18CredentialDirectory=
  "/run/credentials/agentstudio-pg18-native.service" as const

export function expectedNativePg18Secret(name:NativePg18SecretName):string{
  if(name!=="api.secret"&&name!=="native-auth.secret"&&
     name!=="model-encryption.secret"&&name!=="model-broker.secret"&&name!=="local-executor.secret")
    throw Error("unsafe_native_pg18_credential")
  return nativePg18CredentialDirectory+"/"+name
}

export function acceptsNativePg18Credential(input:{
  name:NativePg18SecretName
  file:string
  env:NodeJS.ProcessEnv
  uid:number|undefined
  stat:NativeSecretMetadata
  canRead:boolean
}):boolean {
  const {name,file,env,uid,stat,canRead}=input
  if(name!=="api.secret"&&name!=="native-auth.secret"&&
     name!=="model-encryption.secret"&&name!=="model-broker.secret"&&name!=="local-executor.secret"||
     !Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     !canRead||!stat.isFile()||stat.isSymbolicLink()||
     !Number.isSafeInteger(stat.mode)||
     !Number.isSafeInteger(stat.uid)||!Number.isSafeInteger(stat.gid)||
     !Number.isSafeInteger(stat.size)||stat.size<40||stat.size>512)
    return false
  const expected=expectedNativePg18Secret(name)
  const envKey=name==="api.secret"?"AGENT_STUDIO_PG_PASSWORD_FILE":
    name==="native-auth.secret"?"AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE":
    name==="model-encryption.secret"?"AGENT_STUDIO_PG_MODEL_ENCRYPTION_KEY_FILE":
    name==="local-executor.secret"?"AGENT_STUDIO_PG18_LOCAL_EXECUTOR_PASSWORD_FILE":
      "AGENT_STUDIO_PG_MODEL_BROKER_PASSWORD_FILE"
  if(file!==expected||
     env.CREDENTIALS_DIRECTORY!==nativePg18CredentialDirectory||
     env[envKey]!==expected)
    return false
  const mode=stat.mode&0o7777
  // The scoped dynamic-user account can own an ordinary 0400/0600 secret.
  if(stat.uid===uid&&(mode===0o400||mode===0o600))
    return true
  // systemd 255 may stage root:root 0440 + an ACL granting the service
  // dynamic UID effective read access. Group write, other permissions,
  // arbitrary group owners and special bits are never accepted.
  return stat.uid===0&&stat.gid===0&&mode===0o440
}
export function assertNativePg18Credential(input:Parameters<
  typeof acceptsNativePg18Credential
>[0]):void {
  if(!acceptsNativePg18Credential(input))
    throw Error("unsafe_native_pg18_credential")
}

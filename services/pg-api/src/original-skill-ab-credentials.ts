// Fixed systemd mounts; importing this module reads no credentials.
import {lstatSync,realpathSync,accessSync,readFileSync,constants} from 'node:fs'
import {createPrivateKey,X509Certificate} from 'node:crypto'
import {nativePg18CredentialDirectory} from './native-credential-policy.ts'
type Kind='api'|'broker'
const directories={api:nativePg18CredentialDirectory,broker:'/run/credentials/agentstudio-pg18-skill-ab-broker.service'}
const names={api:new Set(['skill-ab-ca.pem','skill-ab-api.pem','skill-ab-api.key']),broker:new Set(['api.secret','dispatch.secret','broker.secret','model-encryption.secret','skill-ab-ca.pem','skill-ab-server.pem','skill-ab-server.key'])}
function deny():never{throw Error('original_skill_ab_credential_refused')}
export function readSkillAbCredential(kind:Kind,name:string,env:NodeJS.ProcessEnv,uid=process.getuid?.()):Buffer{
 if(kind!=='api'&&kind!=='broker'||!names[kind].has(name)||!Number.isSafeInteger(uid)||uid===undefined||uid<=0||env.CREDENTIALS_DIRECTORY!==directories[kind])deny()
 const directory=directories[kind],file=directory+'/'+name
 try{const folder=lstatSync(directory),stat=lstatSync(file)
  if(!folder.isDirectory()||folder.isSymbolicLink()||(folder.mode&0o022)!==0||![0,uid].includes(folder.uid)||realpathSync(file)!==file||!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>65536)deny()
  const mode=stat.mode&0o7777;if(!(stat.uid===uid&&(mode===0o400||mode===0o600))&&!(stat.uid===0&&stat.gid===0&&mode===0o440))deny()
  accessSync(file,constants.R_OK);const bytes=readFileSync(file),after=lstatSync(file)
  if(after.dev!==stat.dev||after.ino!==stat.ino||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.isSymbolicLink()||bytes.length!==stat.size){bytes.fill(0);deny()}
  return bytes
 }catch{deny()}
}
export function assertSkillAbClientMaterial(ca:Buffer,cert:Buffer,key:Buffer,now=Date.now()){
 try{const pem=ca.toString('utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);if(!pem?.length)deny();const authorities=pem.map(p=>new X509Certificate(p)),leaf=new X509Certificate(cert)
  for(const c of [...authorities,leaf])if(!Number.isFinite(Date.parse(c.validFrom))||!Number.isFinite(Date.parse(c.validTo))||Date.parse(c.validFrom)>now||Date.parse(c.validTo)<=now)deny()
  if(authorities.some(c=>!c.ca)||leaf.ca||!leaf.checkPrivateKey(createPrivateKey(key))||!authorities.some(c=>leaf.verify(c.publicKey))||!leaf.keyUsage?.includes('1.3.6.1.5.5.7.3.2'))deny()
 }catch{deny()}
}

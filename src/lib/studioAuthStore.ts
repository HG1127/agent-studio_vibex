import {BaseAuthStore,type RecordModel} from "pocketbase"
export const STUDIO_AUTH_KEY="agent_studio_employee_auth"
const PREFERENCES_KEY="agent_studio_login_preferences"
type StorageLike=Pick<Storage,"getItem"|"setItem"|"removeItem">
function storage(kind:"localStorage"|"sessionStorage"):StorageLike|null{try{return typeof window!=="undefined"?window[kind]:null}catch{return null}}
function read(s:StorageLike|null,key:string){try{return s?.getItem(key)||""}catch{return ""}}
function remove(s:StorageLike|null,key:string){try{s?.removeItem(key)}catch{/* Memory-only fallback. */}}
function write(s:StorageLike|null,key:string,value:string){try{s?.setItem(key,value)}catch{/* Private mode/quota: stay signed in in memory only. */}}
function envelope(raw:string):{token:string;record:RecordModel|null}|null{
  try{const v=JSON.parse(raw);return v&&typeof v.token==="string"&&v.record&&typeof v.record.id==="string"?{token:v.token,record:v.record}:null}catch{return null}
}
function publicRecord(record:RecordModel|null|undefined):RecordModel|null{
  if(!record)return null
  const safe:RecordModel={id:record.id,collectionId:String(record.collectionId||""),collectionName:String(record.collectionName||"studio_users")}
  for(const key of ["email","display_name","role","active","share_enabled","collectionId","collectionName","verified","emailVisibility","created","updated"])
    if(record[key]!==undefined)safe[key]=record[key]
  return safe
}
/** Only a server-issued session token and public account profile are persisted.
 * Passwords never enter this store. Session-only is the default for new logins.
 */
export class StudioAuthStore extends BaseAuthStore{
  private persistent=false
  private local:StorageLike|null
  private session:StorageLike|null
  constructor(local:StorageLike|null=storage("localStorage"),session:StorageLike|null=storage("sessionStorage")){
    super();this.local=local;this.session=session
    const temporary=envelope(read(session,STUDIO_AUTH_KEY)),saved=envelope(read(local,STUDIO_AUTH_KEY))
    this.persistent=!temporary&&!!saved
    const initial=temporary||saved
    if(initial)super.save(initial.token,publicRecord(initial.record))
    if(typeof window!=="undefined")window.addEventListener("storage",event=>{
      if(!this.persistent||event.key!==STUDIO_AUTH_KEY||event.storageArea!==window.localStorage)return
      const next=envelope(event.newValue||"")
      if(next)super.save(next.token,publicRecord(next.record));else super.clear()
    })
  }
  setPersistence(remember:boolean){
    this.persistent=remember
    if(this.token)this.save(this.token,this.record)
    else{remove(this.local,STUDIO_AUTH_KEY);remove(this.session,STUDIO_AUTH_KEY)}
  }
  override save(token:string,record?:RecordModel|null){
    const safe=publicRecord(record)
    remove(this.persistent?this.session:this.local,STUDIO_AUTH_KEY)
    if(token)write(this.persistent?this.local:this.session,STUDIO_AUTH_KEY,JSON.stringify({token,record:safe}))
    else{remove(this.local,STUDIO_AUTH_KEY);remove(this.session,STUDIO_AUTH_KEY)}
    super.save(token,safe)
  }
  override clear(){remove(this.local,STUDIO_AUTH_KEY);remove(this.session,STUDIO_AUTH_KEY);super.clear()}
}
export function readLoginPreferences(s:StorageLike|null=storage("localStorage")):{email:string;rememberAccount:boolean;rememberLogin:boolean}{
  try{const p=JSON.parse(read(s,PREFERENCES_KEY));return {email:p.rememberAccount===true&&typeof p.email==="string"?p.email.slice(0,180):"",rememberAccount:p.rememberAccount===true,rememberLogin:p.rememberLogin===true}}catch{return {email:"",rememberAccount:false,rememberLogin:false}}
}
export function saveLoginPreferences(email:string,rememberAccount:boolean,rememberLogin:boolean,s:StorageLike|null=storage("localStorage")){
  if(!rememberAccount&&!rememberLogin){remove(s,PREFERENCES_KEY);return}
  write(s,PREFERENCES_KEY,JSON.stringify({email:rememberAccount?email.trim().slice(0,180):"",rememberAccount,rememberLogin}))
}

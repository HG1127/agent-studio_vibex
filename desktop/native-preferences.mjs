import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {localObject,localId} from '../shared/native-local-device-contract.mjs'
import {guidedServer} from '../shared/native-guided-contract.mjs'
import {privateDirectory,privateRead,privateSave} from '../local-executor/native-private.mjs'
/** One owner/server file, serialized writes. A preference is never authority. */
export function createNativePreferences({home=os.homedir(),serverOrigin}){
 const server=guidedServer(serverOrigin+'/__pg_native'),key=createHash('sha256').update(server).digest('hex');let writing=Promise.resolve()
 const file=async owner=>path.join(await privateDirectory(home,['.agent-studio','native-preferences',key,localId(owner)],{create:true}),'credentials-native-preference.json')
 function parse(raw,owner){const v=localObject(raw,['protocol','server','owner','id','paused','fingerprint']);if(v.protocol!=='native_desktop_preference_v1'||v.server!==server||v.owner!==owner||typeof v.paused!=='boolean'||typeof v.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(v.fingerprint))throw Error('native_desktop_invalid_preference');localId(v.id);return v}
 async function read(owner){await writing;try{return parse(await privateRead(await file(owner)),owner)}catch(error){if(error.code==='ENOENT')return null;throw error}}
 function save(owner,value){const record=parse({protocol:'native_desktop_preference_v1',server,owner,...value},owner);const work=writing.then(async()=>{const f=await file(owner);let fresh=false;try{await privateRead(f)}catch(error){if(error.code!=='ENOENT')throw error;fresh=true}await privateSave(f,record,{fresh})});writing=work.catch(()=>{});return work}
 return Object.freeze({read,save})
}

import {createHash,createHmac,pbkdf2Sync,timingSafeEqual} from "node:crypto"
import {makeNativeScramVerifier} from "./native-activation-cli.mjs"
export function validateServiceLoginPassword(password){
  if(typeof password!=="string"||!/^[a-f0-9]{80}$/.test(password))throw Error("independent_service_password_required")
  return password
}
export function matchesServiceScram(password,verifier){
  const match=typeof verifier==="string"?verifier.match(/^SCRAM-SHA-256\$(\d+):([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/):null
  if(!match)throw Error("service_password_state_unexpected")
  const iterations=Number(match[1]),salt=Buffer.from(match[2],"base64"),stored=Buffer.from(match[3],"base64"),server=Buffer.from(match[4],"base64")
  if(!Number.isSafeInteger(iterations)||iterations<4096||iterations>1000000||salt.length<16||salt.length>64||stored.length!==32||server.length!==32||
    salt.toString("base64")!==match[2]||stored.toString("base64")!==match[3]||server.toString("base64")!==match[4])throw Error("service_password_state_unexpected")
  const salted=pbkdf2Sync(password,salt,iterations,32,"sha256"),client=createHmac("sha256",salted).update("Client Key").digest()
  const actual=createHash("sha256").update(client).digest()
  try{return timingSafeEqual(actual,stored)}finally{salted.fill(0);client.fill(0);actual.fill(0)}
}
export function serviceLoginVerifier(password){return makeNativeScramVerifier(validateServiceLoginPassword(password))}

import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto"

export type EncryptedModelSecret={ciphertext:Buffer;nonce:Buffer;tag:Buffer}

export function parseModelEncryptionKey(raw:string):Buffer {
  const value=typeof raw==="string"?raw.replace(/\r?\n$/,""):""
  if(!/^[a-f0-9]{64}$/i.test(value))
    throw Error("invalid_model_encryption_key")
  return Buffer.from(value,"hex")
}

export function encryptModelSecret(plain:string,key:Buffer):EncryptedModelSecret {
  if(!Buffer.isBuffer(key)||key.length!==32||
     typeof plain!=="string"||plain.length<8||plain.length>4096||
     /[\u0000-\u001f\u007f]/u.test(plain))
    throw Error("invalid_model_secret")
  const nonce=randomBytes(12)
  const cipher=createCipheriv("aes-256-gcm",key,nonce,{authTagLength:16})
  const ciphertext=Buffer.concat([cipher.update(plain,"utf8"),cipher.final()])
  return {ciphertext,nonce,tag:cipher.getAuthTag()}
}

export function decryptModelSecret(value:EncryptedModelSecret,key:Buffer):string {
  if(!Buffer.isBuffer(key)||key.length!==32||
     !Buffer.isBuffer(value.ciphertext)||value.ciphertext.length<8||
     value.ciphertext.length>4096||
     !Buffer.isBuffer(value.nonce)||value.nonce.length!==12||
     !Buffer.isBuffer(value.tag)||value.tag.length!==16)
    throw Error("invalid_encrypted_model_secret")
  try{
    const decipher=createDecipheriv("aes-256-gcm",key,value.nonce,{authTagLength:16})
    decipher.setAuthTag(value.tag)
    const result=Buffer.concat([
      decipher.update(value.ciphertext),decipher.final()
    ]).toString("utf8")
    if(result.length<8||/[\u0000-\u001f\u007f]/u.test(result))
      throw Error("invalid_model_secret")
    return result
  }catch{
    throw Error("model_secret_authentication_failed")
  }
}

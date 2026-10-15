import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const js = fs.readFileSync(path.join(root, "pocketbase/pb_hooks/modules/model_connections.js"), "utf8")
const sandbox = { module:{exports:{}} }
vm.runInNewContext(js, sandbox, { filename:"model_connections.js",timeout:1200 })
const repository = sandbox.module.exports

const record = (id, fields) => ({
  id,
  get:(key) => fields[key],
  getBool:(key) => Boolean(fields[key]),
  getString:(key) => {
    const v=fields[key]
    return typeof v==="string"?v : JSON.stringify(v ?? "")
  },
})
const fixtures = [
  record("owned1", {rh_user_id:"A",enabled:true, provider:"openai",base_url:"http://127.0.0.1:7352/v1/",api_key:"plain-test-key",models:["mock"]}),
  record("owned2", {rh_user_id:"A",enabled:false,provider:"gemini",base_url:"",api_key:"dont-read",models:["skip"]}),
  record("other1", {rh_user_id:"B",enabled:true,provider:"anthropic",base_url:"",api_key:"other-secret",models:["private"]}),
  record("owned3", {rh_user_id:"A",enabled:true,provider:"gemini",base_url:"",api_key:"gcm1:encryptedblob",models:["gemini"]}),
]
const app = {
  findRecordById(_collection, id) {
    const f=fixtures.find(r=>r.id===id)
    if(!f)throw Error("not found")
    return f
  },
  findRecordsByFilter(_collection,filter,_order,limit,_offset,params) {
    assert.match(filter,/rh_user_id/)
    return fixtures.filter(r=>r.get("rh_user_id")===params.uid).slice(0,limit)
  },
}
const noSecrets={secretKey:"",decrypt:()=>{throw Error("should not decrypt")}}

test("Model repository checks tenant owner and enabled state before key decoding",()=>{
  assert.equal(repository.lookup(app,"A","other1","private",noSecrets).error,"custom_connection_missing")
  assert.equal(repository.lookup(app,"","owned1","mock",noSecrets).error,"custom_connection_missing")
  assert.equal(repository.lookup(app,"A","missing","mock",noSecrets).error,"custom_connection_missing")
  assert.equal(repository.lookup(app,"A","owned2","skip",noSecrets).error,"custom_connection_disabled")
})
test("Model repository returns authorized provider normalization without exposing secret to errors",()=>{
  const out=repository.lookup(app,"A","owned1","mock",noSecrets)
  assert.equal(out.ok,true)
  assert.equal(out.provider,"openai")
  assert.equal(out.baseUrl,"http://127.0.0.1:7352/v1")
  assert.equal(out.apiKey,"plain-test-key")
  assert.equal(out.model,"mock")
  const all=repository.getDefault(app,"A")
  assert.equal(all.connection_id,"owned1")
  assert.equal(all.model_id,"mock")
  assert.equal(repository.getDefault(app,"nobody"),null)
})
test("Model repository handles gcm keys and preserves legacy obfuscation compatibility",()=>{
  assert.equal(repository.lookup(app,"A","owned3","gemini",noSecrets).error,"custom_connection_invalid")
  let decrypted=0
  const good=repository.lookup(app,"A","owned3","gemini",{
    secretKey:"z".repeat(32),
    decrypt(blob,key){
      assert.equal(blob,"encryptedblob")
      assert.equal(key,"z".repeat(32))
      decrypted++
      return "decrypted-mock-key"
    }
  })
  assert.equal(decrypted,1)
  assert.equal(good.provider,"gemini")
  assert.equal(good.baseUrl,"https://generativelanguage.googleapis.com/v1beta")
  assert.equal(good.apiKey,"decrypted-mock-key")
  assert.equal(repository.decodeKey("gcm1:broken","z".repeat(32),()=>{throw Error("invalid")}),"")
  assert.equal(repository.decodeKey("100.104.110", "",null),"aek") // decoded from decimal-minus-three
  assert.equal(repository.decodeKey("123plain", "",null),"123plain")
})
test("Disabled default connections are skipped and legacy blank providers remain OpenAI",()=>{
  const tailored={
    ...app,
    findRecordsByFilter(){return [fixtures[1],fixtures[0]]}
  }
  assert.equal(repository.getDefault(tailored,"A").connection_id,"owned1")
  const legacy=record("legacy",{rh_user_id:"A",enabled:true,provider:"",base_url:"https://local.test/v1",api_key:"key"})
  const legacyApp={...app,findRecordById(){return legacy}}
  assert.equal(repository.lookup(legacyApp,"A","legacy","custom",noSecrets).provider,"openai")
})

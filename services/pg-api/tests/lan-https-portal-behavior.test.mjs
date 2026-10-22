import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const script=fs.readFileSync(path.join(root,
  "ops/native-lan-pilot/www/app.js"),"utf8")
class NodeStub{
  constructor(id=""){
    this.id=id
    this.hidden=false
    this.textContent=""
    this.value=""
    this.disabled=false
    this.dataset={}
    this.listeners=new Map()
    this.children=[]
    this.classList={
      toggle:()=>{},add:()=>{},remove:()=>{}
    }
  }
  addEventListener(event,fn){this.listeners.set(event,fn)}
  replaceChildren(...items){this.children=items}
  append(...items){this.children.push(...items)}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function browser(protocol,fetchImpl){
  const ids=[
    "loading","login-panel","workspace","message","login-submit",
    "email","password","login-form","display-name","identity-email",
    "role-label","logout","refresh","results","count-agents",
    "count-workflows","count-kbs"
  ]
  const nodes=Object.fromEntries(ids.map(id=>[id,new NodeStub(id)]))
  const tabs=["agents","workflows","kbs"].map(kind=>{
    const t=new NodeStub(kind);t.dataset.kind=kind;return t
  })
  const document={
    getElementById:id=>nodes[id]??null,
    querySelectorAll:selector=>selector===".tab"?tabs:[],
    createElement:tag=>new NodeStub(tag),
  }
  const ctx={
    document,location:{protocol},fetch:fetchImpl,
    AbortSignal,Error,Object,String,Promise,Array,
  }
  vm.runInNewContext(script,ctx,{timeout:5000})
  return {nodes,tabs}
}
test("insecure HTTP blocks both initial auth request and programmatic login",async()=>{
  const requests=[]
  const {nodes}=browser("http:",async(...args)=>{
    requests.push(args)
    throw Error("network_was_not_supposed_to_be_reached")
  })
  assert.equal(requests.length,0)
  assert.equal(nodes.loading.hidden,true)
  assert.equal(nodes.loginPanel?.hidden,undefined)
  assert.match(nodes.message.textContent,/HTTPS/)
  nodes.email.value="staff@example.com"
  nodes.password.value="test-password"
  const submit=nodes["login-form"].listeners.get("submit")
  assert.equal(typeof submit,"function")
  await submit({preventDefault(){}})
  assert.equal(requests.length,0)
  assert.equal(nodes.password.value,"")
  assert.match(nodes.message.textContent,/https_required/)
})
test("trusted HTTPS login only reads employee-scoped lists, then revokes session",async()=>{
  const called=[]
  let authenticated=false
  const user={id:"person-test",email:"admin@example.com",
    display_name:"Company Admin",is_admin:true}
  function response(code,value){
    return {ok:code<400,status:code,json:async()=>value}
  }
  const fetchImpl=async(url,init)=>{
    called.push({url,method:init.method,credentials:init.credentials,
      headers:init.headers})
    if(url==="/api/native-auth/login"&&init.method==="POST"){
      authenticated=true
      return response(200,{authenticated:true})
    }
    if(url==="/api/native-auth/logout"&&init.method==="POST"){
      authenticated=false
      return response(200,{ok:true})
    }
    if(url==="/api/native-auth/me")
      return authenticated
        ?response(200,{authenticated:true,user})
        :response(401,{error:"session_required"})
    if(url==="/api/v2/agent-specs?limit=30"){
      if(!authenticated)return response(401,{error:"session_required"})
      return response(200,{items:[{id:"a",name:"Private Agent",revision:1}]})
    }
    if(url==="/api/v2/workflows?limit=30"){
      if(!authenticated)return response(401,{error:"session_required"})
      return response(200,{items:[]})
    }
    if(url==="/api/v2/knowledge-bases?limit=30"){
      if(!authenticated)return response(401,{error:"session_required"})
      return response(200,{items:[{id:"b",name:"Private KB",revision:2}]})
    }
    throw Error("unexpected_url:"+url)
  }
  const {nodes}=browser("https:",fetchImpl)
  await tick()
  assert.equal(nodes["login-panel"].hidden,false)
  nodes.email.value="admin@example.com"
  nodes.password.value="synthetic-password-2026"
  const submit=nodes["login-form"].listeners.get("submit")
  await submit({preventDefault(){}})
  assert.equal(nodes.workspace.hidden,false)
  assert.equal(nodes["count-agents"].textContent,"1")
  assert.equal(nodes["count-workflows"].textContent,"0")
  assert.equal(nodes["count-kbs"].textContent,"1")
  assert.equal(nodes["display-name"].textContent,"Company Admin")
  assert.equal(nodes.password.value,"")
  assert.ok(called.every(x=>x.credentials==="same-origin"))
  assert.ok(called.every(x=>!Object.hasOwn(x.headers,"Authorization")))
  assert.ok(called.every(x=>!Object.hasOwn(x.headers,"X-Rh-User-Id")))
  assert.deepEqual(called.filter(x=>x.method==="POST").map(x=>x.url),
    ["/api/native-auth/login"])
  assert.equal(nodes.results.children.length,1)
  await nodes.logout.listeners.get("click")()
  assert.equal(authenticated,false)
  assert.equal(nodes.workspace.hidden,true)
  assert.equal(nodes["login-panel"].hidden,false)
  assert.equal(nodes.results.children.length,0)
  assert.equal(nodes["count-agents"].textContent,"—")
  assert.equal(nodes["count-kbs"].textContent,"—")
  assert.deepEqual(called.filter(x=>x.method==="POST").map(x=>x.url),
    ["/api/native-auth/login","/api/native-auth/logout"])
})

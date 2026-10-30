import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {
  confirmInStudio,noticeInStudio,inputInStudio,
  respondToStudioDialog,subscribeStudioDialogs
} from "../src/lib/studioDialogs.ts"
import {
  registerUnsavedWorkCheck,shouldNavigateFromUnsavedWorkAsync
} from "../src/lib/unsavedNavigation.ts"

test("no visible dialog host means destructive actions fail closed",async()=>{
  assert.equal(await confirmInStudio("delete everything?"),false)
  assert.equal(await inputInStudio("enter credentials"),null)
  await noticeInStudio("no UI yet")
})
test("host queues branded confirms and respects cancel, consent, input and notice",async()=>{
  const states=[]
  const unsubscribe=subscribeStudioDialogs(q=>states.push(q))
  try{
    const first=confirmInStudio("离开当前未保存的草稿？")
    const second=confirmInStudio("取消共享访问权限？",{destructive:true})
    assert.equal(states.length,2)
    assert.equal(states[0],null,"subscription initially sees no dialog")
    assert.equal(states[1].message,"离开当前未保存的草稿？")
    respondToStudioDialog(states[1].id,false)
    assert.equal(await first,false)
    assert.equal(states.at(-1).message,"取消共享访问权限？")
    respondToStudioDialog(states.at(-1).id,true)
    assert.equal(await second,true)
    const input=inputInStudio("输入新名称")
    assert.equal(states.at(-1).mode,"input")
    respondToStudioDialog(states.at(-1).id,"my-safe-agent")
    assert.equal(await input,"my-safe-agent")
    const notice=noticeInStudio("已保存到本地")
    respondToStudioDialog(states.at(-1).id,true)
    await notice
  }finally{unsubscribe()}
})
test("confirmation canceled on host unmount, stale click cannot approve next dialog",async()=>{
  let current=null
  const unsubscribe=subscribeStudioDialogs(q=>{current=q})
  const pending=confirmInStudio("敏感操作")
  const oldId=current.id
  unsubscribe()
  assert.equal(await pending,false)
  const newer=subscribeStudioDialogs(q=>{current=q})
  try{
    const next=confirmInStudio("另一个待确认操作")
    assert.notEqual(current.id,oldId)
    respondToStudioDialog(oldId,true)
    assert.equal(current.message,"另一个待确认操作")
    respondToStudioDialog(current.id,false)
    assert.equal(await next,false)
  }finally{newer()}
})
test("async unsaved navigation never changes routes without approved consent",async()=>{
  let asked=0
  const release=registerUnsavedWorkCheck(()=>true)
  try{
    const reject=message=>{asked++;assert.match(message,/未保存/);return Promise.resolve(false)}
    assert.equal(await shouldNavigateFromUnsavedWorkAsync("/workflow-canvas?wf=a",
      "/workflow-canvas?wf=a&step=2",reject),true)
    assert.equal(asked,0)
    assert.equal(await shouldNavigateFromUnsavedWorkAsync("/workflow-canvas?wf=a",
      "/knowledge-bases",reject),false)
    assert.equal(asked,1)
    assert.equal(await shouldNavigateFromUnsavedWorkAsync("/agent-create",
      "/skills",()=>Promise.reject(Error("dialog failed"))),false)
    assert.equal(await shouldNavigateFromUnsavedWorkAsync("/agent-create",
      "/skills",()=>Promise.resolve(true)),true)
  }finally{release()}
})
test("client code contains no native alert/confirm/prompt calls",()=>{
  const scanDir=(dir)=>{
    const results=[]
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name)
      if(entry.isDirectory())results.push(...scanDir(file))
      else if(/\.(?:tsx?|jsx?)$/.test(entry.name))results.push(file)
    }
    return results
  }
  const matches=[]
  for(const file of scanDir("src")){
    const source=fs.readFileSync(file,"utf8")
    if(/(?:window|globalThis|self)\s*\.\s*(?:alert|confirm|prompt)\s*\(/.test(source))
      matches.push(file)
    if(/(^|[^\w.])(?:alert|confirm|prompt)\s*\(/m.test(source))
      matches.push(file+" (bare call)")
  }
  assert.deepEqual(matches,[],"User-facing confirmations must be app-owned")
  const main=fs.readFileSync("src/main.tsx","utf8")
  assert.match(main,/StudioDialogHost/,"dialog host must mount above routes")
  assert.match(main,/installUnsavedHistoryGuard\(window, message => confirmInStudio\(message\)\)/)
  // beforeunload messages are browser-owned, and intentionally stay native.
  const editor=fs.readFileSync("src/pages/Home/useHome.ts","utf8")
  assert.match(editor,/addEventListener\("beforeunload"/)
})

#!/usr/bin/env node
// Faster isolated E2E for the standalone studio. No shell interpretation.
// The canonical serial package script is the source of truth for the test
// inventory; each individual test runs in a distinct disposable temp directory.
// TMPDIR or AGENT_STUDIO_E2E_TEMP_ROOT may select a dedicated writable volume.
// Start at concurrency 2 to avoid overloading a dev workstation.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {spawn} from "node:child_process"
import {performance} from "node:perf_hooks"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const parent=path.dirname(root)
const idsFromScripts=(scripts)=>{
 const raw=String(scripts["test:e2e"]||"")
 const steps=raw.split(/\s+&&\s+/)
 if(!steps.length||steps.length>50)throw Error("invalid_serial_suite")
 const files=[]
 for(const step of steps){
  const match=step.trim().match(/^pnpm (test:[a-z0-9-]+)$/)
  if(!match)throw Error("unsupported_test_dispatch:"+step)
  const sub=String(scripts[match[1]]||"")
  const tasks=sub.split(/\s+&&\s+/)
  if(!tasks.length||tasks.length>10)throw Error("unsupported_test_group")
  for(const task of tasks){
   const item=task.trim().match(/^node (tests\/[A-Za-z0-9_.\/-]+\.mjs)$/)
   if(!item||item[1].includes(".."))throw Error("unsafe_test_command:"+match[1])
   const absolute=path.resolve(root,item[1])
   if(!absolute.startsWith(path.join(root,"tests")+path.sep) ||
      !fs.existsSync(absolute))
     throw Error("missing_test_case:"+item[1])
   if(files.includes(item[1]))throw Error("duplicate_test_case:"+item[1])
   files.push(item[1])
  }
 }
 return files
}
function options(args){
 let workers=2,filter=null,listOnly=false
 for(const arg of args){
  if(arg.startsWith("--workers=")){
   const value=Number(arg.slice("--workers=".length))
   if(!Number.isInteger(value)||value<1||value>3)throw Error("invalid_worker_count")
   workers=value
  }else if(arg.startsWith("--only=")){
   const value=arg.slice("--only=".length)
   if(!/^[A-Za-z0-9._-]+$/.test(value))throw Error("invalid_test_filter")
   filter=value
  }else if(arg==="--list"){listOnly=true}
  else throw Error("unknown_argument:"+arg)
 }
 return {workers,filter,listOnly}
}
function redact(raw){
 return String(raw||"")
  .replace(/Bearer\s+[A-Za-z0-9._~+/-]{10,}/gi,"Bearer [REDACTED]")
  .replace(/sk-[A-Za-z0-9_-]{10,}/gi,"[REDACTED_SECRET]")
  .replace(/(?:password|secret|api[_-]?key|access[_-]?token)=[^\s]+/gi,"[REDACTED]")
}
function tail(buf,n=9000){return redact(buf.slice(-n))}
function temporaryParent(){
 const configured=process.env.AGENT_STUDIO_E2E_TEMP_ROOT??process.env.TMPDIR
 const selected=configured===undefined?parent:configured
 if(!selected||!path.isAbsolute(selected)||/^[\\/]{2}/.test(selected)||
    selected.split(/[\\/]/).some(part=>part.toLowerCase()==="pb_data"))
  throw Error("unsafe_e2e_temp_root")
 const resolved=fs.realpathSync(selected)
 if(!fs.statSync(resolved).isDirectory())throw Error("unsafe_e2e_temp_root")
 return resolved
}
function ensureDisk(directory){
 const disk=fs.statfsSync(directory)
 const free=Number(disk.bavail)*Number(disk.bsize)
 if(!Number.isFinite(free)||free<512*1024*1024)
  throw Error("isolated_test_volume_low_space")
}
async function run(){
 const packageJson=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"))
 const opts=options(process.argv.slice(2))
 let cases=idsFromScripts(packageJson.scripts)
 if(opts.filter)cases=cases.filter(p=>path.basename(p).includes(opts.filter))
 if(!cases.length)throw Error("no_matching_tests")
 if(opts.listOnly){cases.forEach(t=>process.stdout.write(t+"\n"));return}
 const tempParent=temporaryParent()
 ensureDisk(tempParent)
 const session=fs.mkdtempSync(path.join(tempParent,"agentstudio-ci-"))
 const active=new Map(),finished=[]
 let next=0,aborted=false
 const start=performance.now()
 let stopping=false
 const stop=()=>{
  stopping=true;aborted=true
  for(const child of active.values())if(child.exitCode===null)child.kill()
 }
 process.once("SIGINT",stop)
 process.once("SIGTERM",stop)
 const invoke=async(file)=>{
  const name=path.basename(file)
  const dir=path.join(session,name.replace(/[^A-Za-z0-9._-]/g,"_"))
  fs.mkdirSync(dir,{recursive:false,mode:0o700})
  const env={...process.env,TMP:dir,TEMP:dir,TMPDIR:dir}
  const started=performance.now()
  const child=spawn(process.execPath,[path.join(root,file)],{
   cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true,
  })
  active.set(file,child)
  let out="",err=""
  const append=(old,input)=>{const chunk=String(input);return(old+chunk).slice(-16384)}
  child.stdout.on("data",v=>{out=append(out,v)})
  child.stderr.on("data",v=>{err=append(err,v)})
  const done=await new Promise(resolve=>{
   let error=null
   child.on("error",e=>{error=e})
   child.on("close",(code,signal)=>resolve({code,signal,error}))
  })
  active.delete(file)
  const ms=Math.round(performance.now()-started)
  const passed=done.code===0&&!done.error&&!done.signal
  finished.push({file,passed,ms})
  process.stdout.write((passed?"PASS ":"FAIL ")+name+" "+(ms/1000).toFixed(1)+"s\n")
  if(!passed){
   aborted=true
   process.stderr.write("FAIL "+name+" exit="+done.code+" signal="+(done.signal||"none")+"\n")
   if(done.error)process.stderr.write("PROCESS_ERROR "+done.error.code+"\n")
   process.stderr.write("STDOUT_TAIL\n"+tail(out)+"\nSTDERR_TAIL\n"+tail(err)+"\n")
  }
  return passed
 }
 const runners=Array.from({length:Math.min(opts.workers,cases.length)},async()=>{
  while(!aborted && !stopping && next<cases.length){
   const index=next++
   await invoke(cases[index])
  }
 })
 try{
  process.stdout.write("Agent Studio E2E parallel | workers="+opts.workers+
    " | tests="+cases.length+" | isolated_temp=true\n")
  await Promise.all(runners)
 }finally{
  process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop)
  // Never remove any path outside the uniquely created owned test session.
  for(let k=0;k<6;k++){
   try{fs.rmSync(session,{recursive:true,force:true,maxRetries:5,retryDelay:200});break}
   catch(error){if(k===5)throw error;await new Promise(r=>setTimeout(r,300*(k+1)))}
  }
 }
 const elapsed=(performance.now()-start)/1000
 const passed=finished.filter(x=>x.passed).length
 process.stdout.write("E2E_SUMMARY "+JSON.stringify({
  status:passed===cases.length&&!stopping?"PASS":"FAIL",
  completed:finished.length,total:cases.length,passed,
  failed:finished.length-passed,seconds:Math.round(elapsed*10)/10,
  workers:opts.workers,
 })+"\n")
 if(passed!==cases.length||stopping)process.exitCode=1
}
run().catch(error=>{
 const code=String(error?.message||"parallel_e2e_failed")
 process.stderr.write("E2E_RUNNER_ERROR "+code.slice(0,180)+"\n")
 process.exitCode=2
})

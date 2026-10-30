import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

export async function discoverUnitTests(root){
 const directory=path.join(root,'tests'),rows=await fs.readdir(directory,{withFileTypes:true})
 const files=[]
 for(const row of rows){
  if(!row.name.endsWith('.test.mjs'))continue
  if(!row.isFile()||row.isSymbolicLink()||!/^[\w.-]+\.test\.mjs$/.test(row.name))throw Error('invalid_unit_test_entry')
  files.push('tests/'+row.name)
 }
 if(!files.length)throw Error('unit_test_inventory_empty')
 return files.sort()
}
export async function runUnitTests(root,{spawnChild=spawn,concurrency=2,batchSize=30,write=console.log}={}){
 if(![1,2].includes(concurrency)||!Number.isInteger(batchSize)||batchSize<1||batchSize>30)throw Error('invalid_unit_test_options')
 const files=await discoverUnitTests(root),failures=[];let completed=0,stopped=false,child
 const abort=()=>{stopped=true;child?.kill()}
 process.once('SIGINT',abort);process.once('SIGTERM',abort)
 try{
  for(let start=0;start<files.length&&!stopped;start+=batchSize){
   const group=files.slice(start,start+batchSize)
   write('UNIT_BATCH '+JSON.stringify({first:start+1,total:files.length,files:group.length}))
   const code=await new Promise(resolve=>{try{child=spawnChild(process.execPath,['--test','--test-concurrency='+concurrency,...group],{cwd:root,stdio:'inherit',shell:false,windowsHide:true});child.once('error',()=>resolve(1));child.once('close',(code,signal)=>resolve(signal?1:code??1))}catch{resolve(1)}})
   completed+=group.length;if(code!==0)failures.push({first:start+1,files:group.length,code})
  }
  const current=await discoverUnitTests(root),changed=JSON.stringify(current)!==JSON.stringify(files)
  const status=!stopped&&!changed&&!failures.length&&completed===files.length?'PASS':'FAIL'
  const report={status,discovered:files.length,completed,failures,stopped,inventoryChanged:changed,concurrency}
  write('UNIT_SUMMARY '+JSON.stringify(report));return report
 }finally{process.off('SIGINT',abort);process.off('SIGTERM',abort)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
 if(process.argv[2]==='--list')console.log((await discoverUnitTests(root)).join('\n'))
 else if(process.argv.length>2)throw Error('unknown_unit_test_option')
 else{const report=await runUnitTests(root);process.exitCode=report.status==='PASS'?0:1}
}

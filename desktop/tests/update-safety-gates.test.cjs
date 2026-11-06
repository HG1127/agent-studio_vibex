'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {EventEmitter}=require('node:events')
const filename=path.join(__dirname,'../update-controller.cjs')
function fixture({testHome,pending=false,state={busy:false,confirmations:[]},syncError}={}){
 let window,confirmed=0,writes=0
 class Window extends EventEmitter{
  constructor(){super();window=this;this.webContents=new EventEmitter();this.webContents.mainFrame={url:''};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{}}
  async loadURL(url){this.webContents.mainFrame.url=url}isDestroyed(){return false}show(){}focus(){}
 }
 const module={exports:{}},handlers=new Map()
 const core={state:()=>({phase:'ready'}),ready:async()=>({manifest:{version:'0.1.0-preview.99'},installer:'test-only.exe'}),check:async()=>({phase:'ready'})}
 const localRequire=name=>{
  if(name==='./update-core.cjs')return {createUpdater:()=>core,safeUrl:value=>value}
  if(name==='./update-helper.cjs')return {inventory:async()=>({})}
  if(name==='./update-trust.json')return {publicKey:'test-only-public-key'}
  if(name==='./release-history.json')return []
  if(name==='./company-https.cjs')return require('../company-https.cjs')
  if(name==='node:fs/promises')return {mkdir:async()=>{writes++;throw Error('unexpected_transaction_write')}}
  return require(name)
 }
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:localRequire,__dirname:path.dirname(filename),setInterval:()=>({unref(){}}),setTimeout:()=>({unref(){}}),process})
 const updates=module.exports.installUpdates({app:{isPackaged:true,getPath:()=>'.tmp'},BrowserWindow:Window,ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},net:{},dialog:{showMessageBox:async()=>{confirmed++;return {response:0}}},info:{version:'0.1.0-preview.25'},runtimeRoot:path.resolve('.tmp/update-safety-fixture'),testHome,getSettings:()=>({server:'http://127.0.0.1:1'}),saveSettings:async()=>{},hasPendingCalls:()=>pending,getComputerState:()=>{if(syncError)throw Error(syncError);return Promise.resolve(state)},stopServices:async()=>{throw Error('unexpected_stop')},onQuit:()=>{throw Error('unexpected_quit')}})
 return {open:()=>updates.open(),invoke:()=>handlers.get('desktop:update')({sender:window.webContents,senderFrame:window.webContents.mainFrame},'install'),counts:()=>({confirmed,writes})}
}
for(const testHome of [undefined,'isolated-test-profile']){
 const mode=testHome?'isolated profile':'normal profile'
 for(const scenario of [
  {name:'pending native calls',pending:true,error:/本机请求尚未完成/},
  {name:'active local operation',state:{busy:true,confirmations:[]},error:/请先完成或取消/},
  {name:'unanswered permission review',state:{busy:false,confirmations:[{id:'pending'}]},error:/请先完成或取消/},
  {name:'missing local component',syncError:'本机连接组件已停止',error:/本机连接组件已停止/}
 ])test(mode+' blocks update with '+scenario.name,async()=>{
  const f=fixture({...scenario,testHome});await f.open();await assert.rejects(f.invoke(),scenario.error)
  assert.deepEqual(f.counts(),{confirmed:0,writes:0})
 })
 test(mode+' preserves cancellation and writes no update transaction',async()=>{
  const f=fixture({testHome});await f.open();await f.invoke();assert.deepEqual(f.counts(),{confirmed:1,writes:0})
 })
}

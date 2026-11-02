'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{installUpdates}=require('../update-controller.cjs')
test('only the exact private update window main frame can invoke update actions',async()=>{
 let win;class Window extends EventEmitter{constructor(){super();win=this;this.webContents=new EventEmitter();this.webContents.mainFrame={url:''};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{}}async loadURL(url){this.webContents.mainFrame.url=url}isDestroyed(){return false}show(){}focus(){}}
 const handlers=new Map(),settings={server:'https://company.test',port:8123}
 const updates=installUpdates({app:{getPath:()=>'.tmp'},BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},net:{fetch:async()=>new Response('',{status:404})},info:{version:'0.1.0-preview.10'},runtimeRoot:null,testHome:'isolated',getSettings:()=>settings,saveSettings:async()=>{},hasPendingCalls:()=>false,getComputerState:async()=>null,stopServices:async()=>{},onQuit:()=>{}})
 await updates.open();const handle=handlers.get('desktop:update'),valid={sender:win.webContents,senderFrame:win.webContents.mainFrame}
 assert.equal((await handle(valid,'state')).currentVersion,'0.1.0-preview.10')
 for(const event of [{...valid,sender:{}},{...valid,senderFrame:{url:valid.senderFrame.url}},{...valid,senderFrame:{url:'https://company.test'}}])await assert.rejects(handle(event,'state'),/invalid_update_sender/)
 await assert.rejects(handle(valid,'arbitrary-shell'),/invalid_update_action/);await assert.rejects(handle(valid,'feed','http://evil.test/feed'),/HTTPS/)
})

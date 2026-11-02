'use strict'
const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('desktopUpdates',Object.freeze({request:(action,input)=>ipcRenderer.invoke('desktop:update',action,input),onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('desktop:update-state',listener);return()=>ipcRenderer.removeListener('desktop:update-state',listener)}}))

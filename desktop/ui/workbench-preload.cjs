'use strict'
const {contextBridge,ipcRenderer}=require('electron')
const listeners=new Set();let pendingIntent
ipcRenderer.on('desktop:connection-requested',(_event,value)=>{if(!listeners.size)pendingIntent=value;else for(const callback of listeners)callback(value)})
contextBridge.exposeInMainWorld('studioDesktop',Object.freeze({version:2,
  prepareConnection:ticket=>ipcRenderer.invoke('desktop:prepare-pairing',ticket),
  openConnection:()=>ipcRenderer.invoke('desktop:open-connection'),
  computer:(action,input)=>ipcRenderer.invoke('desktop:computer',action,input),
  onConnectionRequested:callback=>{listeners.add(callback);if(pendingIntent){const value=pendingIntent;pendingIntent=undefined;callback(value)}return()=>listeners.delete(callback)},
}))

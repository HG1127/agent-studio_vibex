'use strict'
const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('studioDesktop',Object.freeze({version:1,
  prepareConnection:ticket=>ipcRenderer.invoke('desktop:prepare-pairing',ticket),
  openConnection:()=>ipcRenderer.invoke('desktop:open-connection'),
}))

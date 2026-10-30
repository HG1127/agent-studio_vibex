const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('desktopSettings',Object.freeze({read:()=>ipcRenderer.invoke('desktop:settings'),connect:input=>ipcRenderer.invoke('desktop:connect',input)}))

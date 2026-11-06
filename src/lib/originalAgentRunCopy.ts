export type OriginalRunCopyContext=Readonly<{employee:string;epoch:number;selection:number;runId:string;specId:string;version:string}>
const same=(a:OriginalRunCopyContext|null,b:OriginalRunCopyContext|null)=>Boolean(a&&b&&a.employee===b.employee&&a.epoch===b.epoch&&a.selection===b.selection&&a.runId===b.runId&&a.specId===b.specId&&a.version===b.version)
/** Ports are private closures of the verified original-run session, never
 * browser-supplied identity or a replacement for server authorization. */
export function createOriginalRunCopyAction(ports:{context:()=>OriginalRunCopyContext|null;verify:()=>Promise<void>;read:(id:string)=>Promise<string>}){
 let sequence=0,closed=false
 return{
  cancel(){sequence++},close(){closed=true;sequence++},
  async copy(write:(text:string)=>Promise<void>):Promise<boolean>{
   const source=ports.context(),ticket=++sequence
   const current=()=>!closed&&ticket===sequence&&same(source,ports.context())
   if(!source||closed)return false
   try{
    await ports.verify();if(!current())return false
    const text=await ports.read(source.runId)
    await ports.verify();if(!current()||typeof text!=='string'||!text.trim())return false
    // No await between the last scope check and the clipboard side effect.
    await write(text)
    return current()
   }catch(cause){if(!current())return false;throw cause}
  },
 }
}

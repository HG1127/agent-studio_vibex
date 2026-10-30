import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {desktopConnectionBridge,type DesktopComputerState} from '@/lib/desktopConnectionBridge'
import {desktopComputerRequest,syncDesktopSession} from '@/lib/desktopComputer'
import {pb} from '@/lib/pb'
import {decodeRhToken} from '@/lib/studioAuth'
type ComputerContext={state:DesktopComputerState|null;verified:boolean;busy:boolean;error:string;expanded:boolean;selectionBlocked:boolean;setSelectionBlocked:(value:boolean)=>void;setExpanded:(value:boolean)=>void;refresh:()=>Promise<void>;act:(action:string,input?:Record<string,unknown>)=>Promise<DesktopComputerState|null>}
const Context=createContext<ComputerContext|null>(null)
export const useDesktopComputer=()=>useContext(Context)
/** Session and computer selection survive navigation within the employee UI. */
export function DesktopComputerProvider({children}:{children:ReactNode}){
 const desktop=desktopConnectionBridge()
 const [state,setState]=useState<DesktopComputerState|null>(null),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[selectionBlocked,setSelectionBlocked]=useState(false)
 const alive=useRef(true),generation=useRef(0),locked=useRef(false),polling=useRef(false),mutation=useRef(0)
 const refresh=useCallback(async()=>{
  if(polling.current||locked.current||!pb.authStore.isValid)return
  polling.current=true;const n=generation.current,m=mutation.current,owner=decodeRhToken()?.sub
  try{const next=await desktopComputerRequest('state');if(alive.current&&n===generation.current&&m===mutation.current&&owner===decodeRhToken()?.sub){setState(next);setVerified(true);setError('')}}catch(e){if(alive.current&&n===generation.current&&m===mutation.current){setVerified(false);setError((e as Error).message)}}finally{polling.current=false}
 },[])
 useEffect(()=>{
  if(!desktop)return
  alive.current=true
  const changed=()=>{const n=++generation.current;setState(null);setVerified(false);setSelectionBlocked(false);void syncDesktopSession().then(next=>{if(alive.current&&generation.current===n){setState(next);setVerified(true);setError('');void refresh()}},e=>{if(alive.current&&generation.current===n)setError(e.message)})}
  const unsubscribe=pb.authStore.onChange(changed),off=desktop.onConnectionRequested(()=>{setExpanded(true);void refresh()})
  changed();const timer=setInterval(()=>void refresh(),3000)
  return()=>{alive.current=false;generation.current++;unsubscribe();off();clearInterval(timer)}
 },[desktop,refresh])
 const act=useCallback(async(action:string,input?:Record<string,unknown>)=>{
  if(locked.current)return null
  locked.current=true;mutation.current++;setBusy(true);setError('');const n=generation.current
  try{const next=await desktopComputerRequest(action,input);if(alive.current&&n===generation.current){setState(next);setVerified(true);return next}return null}catch(e){if(alive.current&&n===generation.current){setVerified(false);setError((e as Error).message)}return null}finally{locked.current=false;if(alive.current)setBusy(false)}
 },[])
 const status=state?.profiles.map(p=>p.id+':'+p.state+':'+p.running).join(',')||''
 useEffect(()=>{if(desktop&&verified)window.dispatchEvent(new Event('studio-desktop-devices-changed'))},[desktop,verified,status,state?.selectedId])
 useEffect(()=>{if(state?.confirmations.length)setExpanded(true)},[state?.confirmations.length])
 return <Context.Provider value={desktop?{state,verified,busy,error,expanded,selectionBlocked,setSelectionBlocked,setExpanded,refresh,act}:null}>{children}</Context.Provider>
}

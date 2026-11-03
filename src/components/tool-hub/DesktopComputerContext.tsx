import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {desktopConnectionBridge,type DesktopComputerState} from '@/lib/desktopConnectionBridge'
import {desktopComputerRequest,syncDesktopSession,desktopEmployeeAvailable,subscribeDesktopEmployee} from '@/lib/desktopComputer'
import {getLocalDeviceSessionScope,type LocalDeviceSessionScope} from '@/lib/nativeLocalEmployeeApi'
import {ORIGINAL_PG_UI_ENABLED} from '@/lib/studioBackend'
type ComputerContext={state:DesktopComputerState|null;verified:boolean;busy:boolean;error:string;expanded:boolean;selectionBlocked:boolean;setSelectionBlocked:(value:boolean)=>void;setExpanded:(value:boolean)=>void;refresh:()=>Promise<void>;act:(action:string,input?:Record<string,unknown>)=>Promise<DesktopComputerState|null>}
type Presentation={scope:LocalDeviceSessionScope;lifecycle:number;selection:number}
type DeviceTicket=Presentation&{mutation:number;read:number}
// Unknown UI state is not a server/device DTO and never claims readiness.
type DeviceView=Presentation&{state:DesktopComputerState|null;verified:boolean;busy:boolean;busyMutation:number;error:string;expanded:boolean;selectionBlocked:boolean}
const Context=createContext<ComputerContext|null>(null)
export const useDesktopComputer=()=>useContext(Context)
export function DesktopComputerProvider({children}:{children:ReactNode}){
 const desktop=desktopConnectionBridge(),scope=getLocalDeviceSessionScope()
 const [stored,setStored]=useState<DeviceView|null>(null),[,renderRevision]=useState(0)
 const alive=useRef(true),generation=useRef(0),locked=useRef<number|null>(null),polling=useRef<number|null>(null),mutation=useRef(0),selection=useRef(0),selectedDevice=useRef(''),readSequence=useRef(0),knownDevices=useRef(new Set<string>())
 const currentPresentation=useCallback((p:Presentation)=>{const now=getLocalDeviceSessionScope();return alive.current&&generation.current===p.lifecycle&&selection.current===p.selection&&now.owner===p.scope.owner&&now.epoch===p.scope.epoch},[])
 const current=useCallback((ticket:DeviceTicket)=>currentPresentation(ticket)&&mutation.current===ticket.mutation&&readSequence.current===ticket.read,[currentPresentation])
 const unknown=useCallback((p:Presentation):DeviceView=>({...p,state:null,verified:false,busy:false,busyMutation:0,error:'',expanded:false,selectionBlocked:false}),[])
 const commit=useCallback((ticket:DeviceTicket,change:(value:DeviceView)=>DeviceView)=>setStored(previous=>{if(!current(ticket))return previous;const prior=previous&&previous.scope.owner===ticket.scope.owner&&previous.scope.epoch===ticket.scope.epoch&&previous.lifecycle===ticket.lifecycle?previous:unknown(ticket);return change(prior)}),[current,unknown])
 const stageSelection=useCallback((value:DesktopComputerState,ticket:DeviceTicket)=>{if(!current(ticket))return null;if(selectedDevice.current!==value.selectedId){selectedDevice.current=value.selectedId;selection.current++}knownDevices.current=new Set(value.devices.filter(d=>!d.revoked).map(d=>d.id));return {...ticket,selection:selection.current}},[current])
 const refreshCurrent=useCallback(async()=>{
  if(polling.current!==null||locked.current!==null||!desktopEmployeeAvailable())return
  const read=++readSequence.current,ticket:DeviceTicket={lifecycle:generation.current,mutation:mutation.current,selection:selection.current,read,scope:getLocalDeviceSessionScope()};polling.current=read
  try{const next=await desktopComputerRequest('state',undefined,ticket.scope),accepted=stageSelection(next,ticket);if(accepted)commit(accepted,value=>({...value,...accepted,state:next,verified:true,error:''}))}
  catch(e){commit(ticket,value=>({...value,state:null,verified:false,error:(e as Error).message}))}
  finally{if(polling.current===read)polling.current=null}
 },[stageSelection,commit])
 useEffect(()=>{
  if(!desktop)return
  alive.current=true
  const changed=()=>{
   const lifecycle=++generation.current;mutation.current++;selection.current++;selectedDevice.current='';knownDevices.current=new Set();locked.current=null;polling.current=null
   const ticket:DeviceTicket={lifecycle,mutation:mutation.current,selection:selection.current,read:++readSequence.current,scope:getLocalDeviceSessionScope()}
   commit(ticket,()=>unknown(ticket));renderRevision(n=>n+1)
   if(ORIGINAL_PG_UI_ENABLED&&!desktopEmployeeAvailable())return
   void syncDesktopSession(ticket.scope).then(next=>{const accepted=stageSelection(next,ticket);if(!accepted)return;commit(accepted,value=>({...value,...accepted,state:next,verified:true,error:''}));void refreshCurrent()},e=>commit(ticket,value=>({...value,state:null,verified:false,error:e.message})))
  }
  const unsubscribe=subscribeDesktopEmployee(changed),off=desktop.onConnectionRequested(intent=>{if(!alive.current||intent.deviceId&&!knownDevices.current.has(intent.deviceId))return;const ticket:DeviceTicket={lifecycle:generation.current,mutation:mutation.current,selection:selection.current,read:readSequence.current,scope:getLocalDeviceSessionScope()};commit(ticket,value=>({...value,expanded:true}));void refreshCurrent()})
  changed();const timer=setInterval(()=>void refreshCurrent(),3000)
  return()=>{alive.current=false;generation.current++;mutation.current++;selection.current++;readSequence.current++;locked.current=null;polling.current=null;unsubscribe();off();clearInterval(timer)}
 },[desktop,refreshCurrent,stageSelection,commit,unknown])
 const actCurrent=useCallback(async(action:string,input?:Record<string,unknown>)=>{
  if(locked.current!==null)return null
  const ownMutation=++mutation.current;locked.current=ownMutation
  const ticket:DeviceTicket={lifecycle:generation.current,mutation:ownMutation,selection:selection.current,read:readSequence.current,scope:getLocalDeviceSessionScope()};let completed=ticket
  commit(ticket,value=>({...value,busy:true,busyMutation:ownMutation,error:''}))
  try{const next=await desktopComputerRequest(action,input,ticket.scope),accepted=stageSelection(next,ticket);if(!accepted)return null;completed=accepted;commit(accepted,value=>({...value,...accepted,state:next,verified:true}));return next}
  catch(e){commit(ticket,value=>({...value,state:null,verified:false,error:(e as Error).message}));return null}
  finally{
   // A later read does not own the mutation's busy flag; a new mutation,
   // owner or lifecycle does. Check those again when React runs the updater.
   setStored(previous=>{const now=getLocalDeviceSessionScope();if(!previous||!alive.current||generation.current!==completed.lifecycle||mutation.current!==ownMutation||previous.busyMutation!==ownMutation||previous.lifecycle!==completed.lifecycle||previous.scope.owner!==completed.scope.owner||previous.scope.epoch!==completed.scope.epoch||now.owner!==completed.scope.owner||now.epoch!==completed.scope.epoch)return previous;return {...previous,busy:false}})
   if(locked.current===ownMutation)locked.current=null
  }
 },[stageSelection,commit])
 const presentation:Presentation={scope,lifecycle:generation.current,selection:selection.current}
 const view=stored&&stored.scope.owner===scope.owner&&stored.scope.epoch===scope.epoch&&stored.lifecycle===generation.current?stored:null
 const state=view?.state??null,verified=!!view?.verified&&state!==null,busy=view?.busy??false,error=view?.error??'',expanded=view?.expanded??false,selectionBlocked=view?.selectionBlocked??false
 // Public callbacks bind to this rendered owner and device choice. An old
 // render cannot start a new-owner action before an async request even exists.
 const refresh=async()=>{if(currentPresentation(presentation))await refreshCurrent()}
 const act=async(action:string,input?:Record<string,unknown>)=>currentPresentation(presentation)?actCurrent(action,input):null
 const setExpanded=(value:boolean)=>setStored(previous=>{if(!currentPresentation(presentation))return previous;const prior=previous&&previous.scope.owner===scope.owner&&previous.scope.epoch===scope.epoch&&previous.lifecycle===presentation.lifecycle?previous:unknown(presentation);return {...prior,expanded:value}})
 const setSelectionBlocked=(value:boolean)=>setStored(previous=>{if(!currentPresentation(presentation))return previous;const prior=previous&&previous.scope.owner===scope.owner&&previous.scope.epoch===scope.epoch&&previous.lifecycle===presentation.lifecycle?previous:unknown(presentation);return {...prior,selectionBlocked:value}})
 const status=state?.profiles.map(p=>p.id+':'+p.state+':'+p.running).join(',')||''
 useEffect(()=>{if(desktop&&verified)window.dispatchEvent(new Event('studio-desktop-devices-changed'))},[desktop,verified,status,state?.selectedId])
 useEffect(()=>{if(state?.confirmations.length)setExpanded(true)},[state?.confirmations.length])
 return <Context.Provider value={desktop?{state,verified,busy,error,expanded,selectionBlocked,setSelectionBlocked,setExpanded,refresh,act}:null}>{children}</Context.Provider>
}

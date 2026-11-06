import {useEffect,useRef,useState} from 'react'
import {createOriginalAgentQualityApi,originalQualityBrowserHash} from './originalAgentQualityApi.ts'
import {createOriginalAgentQualitySession} from './originalAgentQualitySession.ts'
import type {createOriginalAgentRunTransport} from './originalAgentRunTransport.ts'
import type {OriginalQualityRevision} from '../../shared/original-agent-quality-contract.ts'
export function useOriginalAgentQuality(options:{employeeId:string;specId:string;baseRevision:number|null;epoch:number;selectionEpoch:number;ready:boolean;transport:ReturnType<typeof createOriginalAgentRunTransport>|null;liveScope:()=>{employeeId:string;specId:string;epoch:number;selectionEpoch:number;ready:boolean};onSaved:()=>Promise<void>}){
 type Controller=ReturnType<typeof createOriginalAgentQualitySession>;type View=ReturnType<Controller['snapshot']>
 const ref=useRef<Controller|null>(null),alignment=useRef(''),latest=useRef(options);latest.current=options
 const key=JSON.stringify([options.employeeId,options.specId,options.epoch,options.selectionEpoch]),liveKey=useRef(key);liveKey.current=key
 const [stored,setStored]=useState<{key:string;view:View}|null>(null)
 useEffect(()=>{
  if(!options.ready||!options.employeeId||!options.specId||!options.transport)return
  const life=key,employee=options.employeeId,spec=options.specId,storageKey='agentstudio.original.quality.v1.'+employee+'.'+spec
  const controller=createOriginalAgentQualitySession({employeeId:employee,specId:spec,scope:()=>{const s=latest.current.liveScope();return{key:JSON.stringify([s.employeeId,s.specId,s.epoch,s.selectionEpoch]),epoch:s.epoch,employeeId:s.employeeId,ready:s.ready}},api:createOriginalAgentQualityApi({employeeId:employee,transport:options.transport.forScope(()=>{const s=latest.current.liveScope();return s.ready&&JSON.stringify([s.employeeId,s.specId,s.epoch,s.selectionEpoch])===life})}),hash:originalQualityBrowserHash,requestId:()=>crypto.randomUUID(),readPending:()=>{const raw=sessionStorage.getItem(storageKey);return raw===null?null:JSON.parse(raw)},writePending:value=>{if(value===null)sessionStorage.removeItem(storageKey);else sessionStorage.setItem(storageKey,JSON.stringify(value))}})
  ref.current=controller;const publish=()=>{if(ref.current===controller&&liveKey.current===life)setStored({key:life,view:controller.snapshot()})};const off=controller.subscribe(publish);publish();void controller.activate().catch(publish)
  return()=>{off();controller.dispose();if(ref.current===controller)ref.current=null}
 },[key,options.ready,options.transport])
 const view=stored?.key===key&&options.ready?stored.view:null,row=view?.row??null,aligned=Boolean(row&&row.spec_revision===options.baseRevision),busy=view?.busy??false
 useEffect(()=>{const c=ref.current;if(!c||!options.ready||!row||aligned||busy||view?.state==='pending_invalid')return;const attempt=JSON.stringify([key,options.baseRevision,row.spec_revision]);if(alignment.current===attempt)return;alignment.current=attempt;void latest.current.onSaved().catch(()=>{}).then(()=>{if(ref.current===c&&liveKey.current===key)return c.activate()}).catch(()=>{})},[options.baseRevision,options.ready,key,row?.spec_revision,aligned,busy,view?.state])
 const finish=async(action:'save'|'confirm',checks?:unknown)=>{const c=ref.current,life=key;if(!c||!latest.current.ready||liveKey.current!==life||action==='save'&&!aligned)return false;const saved=action==='save'?await c.save(checks):await c.confirm();if(saved&&ref.current===c&&liveKey.current===life){await latest.current.onSaved().catch(()=>{});return ref.current===c&&liveKey.current===life&&latest.current.ready}return false}
 return{qualityBusy:busy,qualityUnknown:view?.state==='unknown',qualityLoading:!view||!aligned||view.state==='unloaded',qualityError:view?.error||(!aligned&&row?'验收条件与方案摘要修订尚未对齐，请刷新核对。':''),qualityRevision:aligned?row as OriginalQualityRevision:null,handleSaveQualityChecks:(checks:unknown)=>finish('save',checks),handleConfirmQualityChecks:()=>finish('confirm')}
}

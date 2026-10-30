import {useEffect,useState} from 'react'
import {readConnectorRelease,type ConnectorRelease} from './connectorRelease'
export function useConnectorRelease(){
 const [attempt,setAttempt]=useState(0),[snapshot,setSnapshot]=useState<{attempt:number;release:ConnectorRelease|null;error:string}|null>(null)
 useEffect(()=>{
  const controller=new AbortController()
  void readConnectorRelease(controller.signal).then(release=>{if(!controller.signal.aborted)setSnapshot({attempt,release,error:''})}).catch(()=>{if(!controller.signal.aborted)setSnapshot({attempt,release:null,error:'当前站点的下载版本暂时无法核实；不会据此判断电脑已经更新。'})})
  return()=>controller.abort()
 },[attempt])
 const current=snapshot?.attempt===attempt?snapshot:null
 return {release:current?.release||null,error:current?.error||'',loading:!current,refresh:()=>setAttempt(n=>n+1)}
}

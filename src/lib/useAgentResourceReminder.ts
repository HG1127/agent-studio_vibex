import {useCallback,useEffect,useState} from "react"
import {agentCapabilityRequirements} from "./agentCapabilityPlan"
import type {AgentSpec} from "@/pages/Home/presets"
import {
 AGENT_RESOURCE_HANDOFF_CHANNEL,isMatchingAgentResourceHandoff,
 type AgentResourceHandoff,
} from "./agentResourceHandoff"

/** Receive only an advisory notification for this exact saved Agent/version.
 * A reminder never executes requests, mutates the draft or grants permissions.
 */
export function useAgentResourceReminder(specId:string,spec:AgentSpec|null,enabled=true){
  const ids=spec?agentCapabilityRequirements(spec).map(item=>item.id):[]
  const idsKey=ids.join("\u0000")
  const [received,setReceived]=useState<AgentResourceHandoff|null>(null)
  useEffect(()=>{
    if(!enabled || !spec || !specId || typeof BroadcastChannel==="undefined")return
    let channel:BroadcastChannel
    try{channel=new BroadcastChannel(AGENT_RESOURCE_HANDOFF_CHANNEL)}catch{return}
    const visibleIds=idsKey?idsKey.split("\u0000"):[]
    const onMessage=(event:MessageEvent<unknown>)=>{
      if(isMatchingAgentResourceHandoff(event.data,specId,visibleIds))
        setReceived(event.data)
    }
    channel.addEventListener("message",onMessage)
    return()=>{channel.removeEventListener("message",onMessage);channel.close()}
  },[specId,idsKey,Boolean(spec),enabled])
  const reminder=enabled && spec && received &&
    isMatchingAgentResourceHandoff(received,specId,ids)?received:null
  const dismissReminder=useCallback(()=>setReceived(null),[])
  return {reminder,dismissReminder}
}

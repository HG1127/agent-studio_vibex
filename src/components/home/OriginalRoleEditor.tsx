import {AgentRoleDesigner} from '../agents/AgentRoleDesigner'
import {AgentCapabilityPlanner} from './AgentCapabilityPlanner'
import type {AgentSpec,ConnectedToolOption} from '../../pages/Home/presets'
import type {VerifiedMarketTool} from '../../lib/marketToolSelection'
import type {ToolResolution} from '../../lib/agentToolMatcher'
/** The accepted original controls, embedded in the existing Home editor. */
export default function OriginalRoleEditor(props:{spec:AgentSpec;onChange:(spec:AgentSpec)=>void;builtinTools:{id:string;title:string;desc:string}[];connectedTools:ConnectedToolOption[];marketTools:VerifiedMarketTool[];analysis:ToolResolution|null;notice:string;onRematch:()=>void;onToggleTool:(name:string,checked:boolean)=>void;returnSpecId?:string;disabled?:boolean}){
 const change=(next:AgentSpec)=>{
  if(props.disabled)return
  // Register the actual resource selection with Home's owner-scoped Native
  // metadata handler before replacing the draft, including removals.
  for(const name of props.spec.tools)if(!next.tools.includes(name))props.onToggleTool(name,false)
  for(const name of next.tools)if(!props.spec.tools.includes(name))props.onToggleTool(name,true)
  props.onChange(next)
 }
 return <div className="space-y-4">
  <AgentRoleDesigner spec={props.spec} onChange={change} builtinTools={props.builtinTools} connectedTools={props.connectedTools} connectedMarketTools={props.marketTools} disabled={props.disabled}/>
  <fieldset disabled={props.disabled} className="min-w-0 border-0 p-0"><AgentCapabilityPlanner spec={props.spec} onChange={change} analysis={props.analysis} connections={props.connectedTools} marketTools={props.marketTools} returnSpecId={props.returnSpecId} notice={props.notice} onRematch={props.onRematch} onToggleTool={props.onToggleTool} active={!props.disabled}/></fieldset>
 </div>
}

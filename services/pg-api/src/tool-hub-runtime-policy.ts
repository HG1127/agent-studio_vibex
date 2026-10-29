// Separate, default-off isolated Native opt-in. Never enables a Worker/Broker.
import {selectPublicMcpRegistryRead} from './public-mcp-registry-network.ts'
export type ToolHubCapabilities=Readonly<{available:boolean;trials:boolean;registry:boolean}>
export const OWNER_TOOL_HUB_APPROVAL='APPROVE_DISPOSABLE_PG18_OWNER_TOOL_HUB_ONLY' as const
export function selectOwnerToolHubCapabilities(env:NodeJS.ProcessEnv,base:{listen:boolean;allowedOrigin:string;configurationWrites:boolean;workflowV2ExecutionUat:boolean}):ToolHubCapabilities{
 const available=env.AGENT_STUDIO_PG_OWNER_TOOL_HUB_AVAILABLE,trials=env.AGENT_STUDIO_PG_OWNER_TOOL_TRIALS_ENABLED,approved=env.AGENT_STUDIO_PG_OWNER_TOOL_HUB_APPROVED,registry=selectPublicMcpRegistryRead(env)
 if(available===undefined&&trials===undefined&&approved===undefined&&!registry)return Object.freeze({available:false,trials:false,registry:false})
 let secure=false;try{const origin=new URL(base.allowedOrigin);secure=origin.protocol==='https:'&&origin.origin===base.allowedOrigin}catch{}
 if(available!=='true'||approved!==OWNER_TOOL_HUB_APPROVAL||!base.listen||!secure||trials!==undefined&&trials!=='true'||trials==='true'&&(!base.configurationWrites||!base.workflowV2ExecutionUat))throw Error('owner_tool_hub_opt_in_refused')
 return Object.freeze({available:true,trials:trials==='true',registry})
}

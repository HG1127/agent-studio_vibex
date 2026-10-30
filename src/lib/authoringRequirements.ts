import {localApi} from './localDevices'
import type {AgentSpec} from '@/pages/Home/presets'
export type AuthoringPlan={ready_for_release:boolean;requirements:{id:string;title:string;state:string;limits:string;missing_tools:string[]}[];original_requirements:{state:string;entry_count?:number};input_contract:unknown;task_stages:unknown[];data_objects:string[];artifacts:string[];validators:unknown[]}
export type CapturedRequirements={request_id:string;chain_hash:string;entries:{request_id:string;kind:string;requirement:string}[]}
export type AuthoringPreview={text:string;requestId:string;plan:AuthoringPlan}
export const captureRequirements=(requirement:string,key:string,parent='')=>localApi<CapturedRequirements>('/api/authoring/requirements',{requirement,idempotency_key:key,parent_id:parent})
export const previewRequirements=(requestId:string,spec:Partial<AgentSpec>,signal?:AbortSignal)=>localApi<{spec:AgentSpec;plan:AuthoringPlan;preview_hash:string}>('/api/authoring/preview',{request_id:requestId,spec},signal)

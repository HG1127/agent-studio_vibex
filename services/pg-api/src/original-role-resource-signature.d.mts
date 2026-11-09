import type {AgentSpecInput} from './contracts.ts'
import type {LocalBinding} from '../../../shared/native-local-device-contract.mjs'
export function roleToolSignature(name:string,spec:AgentSpecInput,mcp?:unknown,local?:LocalBinding|null):string

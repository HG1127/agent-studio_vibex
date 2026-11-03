import {originalRoleHash} from './original-role-execution.mjs'
/** Immutable selection identity, never a provider URL, secret or permission. */
export function roleToolSignature(name,spec,mcp=null,local=null){
 return originalRoleHash({name,http:spec.http_tools?.find(t=>t.name===name)??null,mcp,local,model:name==='summarize'?spec.model_binding??null:null,knowledge:name==='knowledge_search'?{ids:spec.knowledge_base_ids,retrieval:spec.knowledge_retrieval??null}:null})
}

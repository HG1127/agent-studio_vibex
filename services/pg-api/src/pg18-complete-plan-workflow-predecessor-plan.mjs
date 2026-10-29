// Exact Root-reviewed order. These identities are prerequisites, never F05 aliases.
import{completeServiceDefinition}from'./pg18-complete-service-plan.mjs'
const original=['api','native-auth','worker','identity','broker','index-worker','index-broker'].map(action=>{const a=completeServiceDefinition(action);return Object.freeze({action,login:a.login,groups:Object.freeze([...a.groups]),connection_limit:-1,auditor:'original_C_actual_login'})})
const auxiliary=[['review_worker','assessment_worker',3],['local_executor','executor',3],['review_dispatch','assessment_dispatch',-1],['design_worker','design_worker',-1],['design_dispatch','design_dispatch',-1]].map(([name,auditor,connection_limit])=>Object.freeze({login:'agentstudio_'+name+'_login',groups:Object.freeze(['agentstudio_'+name]),connection_limit,auditor}))
export const complete069PlanWorkflowPredecessors=Object.freeze([...original,...auxiliary])
export const complete069PlanWorkflowAuxiliaryPredecessors=Object.freeze(auxiliary)
export const complete069PlanWorkflowPreparationOrder=Object.freeze(['original_C8','Review_Worker','Executor','Review_Dispatch_and_Design_pair','PlanWorkflow_pair','Telemetry','final_live_qualification'])

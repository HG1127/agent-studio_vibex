export const originalRunKinds=['agent_single','workflow_safe','workflow_v2','agent_autonomous'] as const
export type OriginalRunKind=typeof originalRunKinds[number]
export type OriginalRunTarget={id:string;kind:OriginalRunKind|null}
export const originalRunId=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s)
export function originalRunDetailTarget(params:URLSearchParams):OriginalRunTarget|null{
 for(const key of ['run','run_id','kind','engine_kind'])if(params.getAll(key).length>1)throw Error('ambiguous_original_run_route')
 const run=params.get('run'),alias=params.get('run_id'),kind=params.get('kind'),engine=params.get('engine_kind')
 if(run!==null&&alias!==null&&run!==alias||kind!==null&&engine!==null&&kind!==engine)throw Error('ambiguous_original_run_route')
 const id=run??alias??'',selected=engine??kind
 if(!id){if(selected)throw Error('original_run_id_required');return null}
 if(!originalRunId(id)||selected!==null&&!originalRunKinds.includes(selected as OriginalRunKind))throw Error('invalid_original_run_route')
 return{id,kind:selected as OriginalRunKind|null}
}
export function originalRunDetailHref(target:{id:string;kind:OriginalRunKind}){
 if(!originalRunId(target.id)||!originalRunKinds.includes(target.kind))throw Error('invalid_original_run_route')
 return '/run-detail?run='+encodeURIComponent(target.id)+'&kind='+target.kind
}

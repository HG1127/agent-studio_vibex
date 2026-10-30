export type OriginalRunPrivacyContext={employeeId:string;closed:boolean;suspended:boolean;recovering?:boolean;sourceDenied?:boolean;ownerChanged?:boolean}
export function originalAgentRunPrivacy(view:OriginalRunPrivacyContext|null,currentEmployee:string){
 const clearLocal=!currentEmployee||Boolean(view&&(view.closed||view.ownerChanged||view.employeeId!==currentEmployee))
 const hidden=!view||clearLocal||view.suspended||view.recovering===true||view.sourceDenied===true
 return Object.freeze({hidden,clearLocal,canAct:!hidden})
}
export function originalAgentRunLocalView<T extends {instruction:string;maxSteps:number;feedbackDraft:{rating:''|'up'|'down';tags:string[];comment:string};replyText:string;copied:boolean;editing:boolean}>(draft:T,hidden:boolean){
 return hidden?{instruction:'',maxSteps:10,feedbackDraft:{rating:'' as const,tags:[] as string[],comment:''},replyText:'',copied:false,editing:false}:draft
}

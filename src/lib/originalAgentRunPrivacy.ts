export type OriginalRunPrivacyContext={employeeId:string;closed:boolean;suspended:boolean;recovering?:boolean;sourceDenied?:boolean;ownerChanged?:boolean}
export function originalAgentRunPrivacy(view:OriginalRunPrivacyContext|null,currentEmployee:string){
 // Missing account is uncertainty, not a verified logout or employee change.
 // Only the original controller may retain drafts, and absence still hides them.
 const clearLocal=Boolean(view&&(view.closed||view.ownerChanged||Boolean(currentEmployee)&&view.employeeId!==currentEmployee))
 const hidden=!currentEmployee||!view||clearLocal||view.suspended||view.recovering===true||view.sourceDenied===true
 return Object.freeze({hidden,clearLocal,canAct:!hidden})
}
export function originalAgentRunLocalView<T extends {instruction:string;maxSteps:number;feedbackDraft:{rating:''|'up'|'down';tags:string[];comment:string};replyText:string;copied:boolean;editing:boolean}>(draft:T,hidden:boolean){
 return hidden?{instruction:'',maxSteps:10,feedbackDraft:{rating:'' as const,tags:[] as string[],comment:''},replyText:'',copied:false,editing:false}:draft
}

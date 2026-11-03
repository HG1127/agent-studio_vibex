import type {OriginalRole} from '../../../shared/original-role-execution-contract.mjs'
export type ReviewedPlan={version:1;summary:string;nodes:{id:string;title:string;objective:string;source_role:string;depends_on:string[];tools:string[];required_tools:string[];local_tools:string[];inputs:string[];outputs:string[];acceptance:string[];skill_refs:OriginalRole['skill_refs']}[];missing_capabilities:string[];minimum_steps:number;resource_bindings:{id:string;signature:string}[]}
export function reviewedPlanCatalog(state:unknown):{id:string;signature:string;local_tools:string[];approval_required:boolean}[]
export function assertReviewedRoleCatalog(state:unknown):void
export function parseReviewedPlan(text:string,state:unknown,remaining:number):ReviewedPlan
export function reviewedPlanRoles(plan:ReviewedPlan):OriginalRole[]
export function reviewedPlanMissing(plan:ReviewedPlan,roleId:string,evidence:{role_id:string;tool:string;local_tool:string}[]):string[]
export const reviewedPlannerInstruction:string

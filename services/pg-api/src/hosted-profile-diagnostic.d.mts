/** Types for failure observations; these functions grant no runtime capability. */
export function withHostedProfileDiagnostics<T>(profile:unknown,body:()=>T):Promise<Awaited<T>>
export function hostedProfilePhase<T>(phase:unknown,body:()=>T):Promise<Awaited<T>>
export function hostedProfileCatalogRefusal(auditor:unknown,check:unknown):void
export function hostedQuality089Phase<T>(step:unknown,body:()=>T):Promise<Awaited<T>>
export function hostedQuality089Sync<T>(step:unknown,body:()=>T):T
export function emitHostedStaffNamespaceAclDifference(actualJson:unknown,expectedJson?:unknown,rolesJson?:unknown):void
export function hostedQuality089InventoryRefusal(check:unknown):void
export function hostedQuality089SchemaRefusal(stage:string,error:unknown,check?:number):void

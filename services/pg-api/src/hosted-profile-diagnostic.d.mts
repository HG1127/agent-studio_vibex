/** Types for failure observations; these functions grant no runtime capability. */
export function withHostedProfileDiagnostics<T>(profile:unknown,body:()=>T):Promise<Awaited<T>>
export function hostedProfilePhase<T>(phase:unknown,body:()=>T):Promise<Awaited<T>>
export function hostedProfileCatalogRefusal(auditor:unknown,check:unknown):void
export function hostedQuality089Phase<T>(step:unknown,body:()=>T):Promise<Awaited<T>>
export function hostedQuality089Sync<T>(step:unknown,body:()=>T):T
export function emitHostedStaffNamespaceAclDifference(actualJson:unknown,expectedJson?:unknown,rolesJson?:unknown):void
export function hostedQuality089InventoryRefusal(check:unknown):void
export function hostedQuality089SchemaRefusal(stage:string,error:unknown,check?:number):void
export function emitHostedStaff031InventoryDifference(producer:unknown):void
export function emitHostedQuality015ConstraintDifference(producer:unknown):void
export function staff031InventoryObservation(actual:unknown,expected:unknown):unknown
export function validateStaff031Observation(value:unknown):unknown
export function quality015ConstraintObservation(table:unknown,constraint:unknown,actual:unknown,normalize:unknown,tableOrdinal:unknown,constraintOrdinal:unknown):unknown
export function validateQuality015Observation(value:unknown):unknown
export function emitHostedStaffComplete078ContractRefusal(auditor:unknown,check:unknown,error:unknown):void

import {OriginalSchedulesError} from '../../shared/original-schedules-contract.ts'
/** Null cached account is uncertainty; only actual session proof establishes logout. */
export function createOriginalSchedulesIdentity(o:{account():{id:string;active:boolean}|null;verify():Promise<'authenticated'|'signed_out'|'unavailable'>}){
 return{currentEmployee:()=>{const account=o.account();return account?.active?account.id:null},verifyEmployee:async()=>{const status=await o.verify(),account=o.account();if(status==='signed_out'||status==='authenticated'&&account?.active===false)throw new OriginalSchedulesError(401,'original_schedules_verified_signed_out');if(status!=='authenticated'||!account?.active)throw new OriginalSchedulesError(503,'original_schedules_identity_unavailable');return account.id}}
}

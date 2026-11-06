import {OriginalVersionReleaseError} from '../../shared/original-version-release-contract.ts'
type Account={id:string;active:boolean}
/** Same bridge used by the real hook and the actual native auth regressions.
 * account()===null is uncertainty. Only verify() may establish signed_out. */
export function createOriginalVersionReleaseIdentity(options:{account():Account|null;verify():Promise<'authenticated'|'signed_out'|'unavailable'>}){
 return{
  currentEmployee:()=>{const current=options.account();return current?.active?current.id:null},
  verifyEmployee:async()=>{const status=await options.verify(),current=options.account();if(status==='signed_out'||status==='authenticated'&&current?.active===false)throw new OriginalVersionReleaseError(401,'original_release_verified_signed_out');if(status!=='authenticated'||!current?.active)throw new OriginalVersionReleaseError(503,'original_release_identity_unavailable');return current.id},
 }
}

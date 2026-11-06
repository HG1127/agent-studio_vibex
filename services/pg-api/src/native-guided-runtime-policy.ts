export const guidedPairingApproval='APPROVE_DISPOSABLE_PG18_DESKTOP_GUIDED_PAIRING_ONLY'
export function selectNativeGuidedPairing(env:Record<string,string|undefined>,local:{available:boolean;writes:boolean}){
 const value=env.AGENT_STUDIO_PG18_DESKTOP_GUIDED_PAIRING_ENABLED,approval=env.AGENT_STUDIO_PG18_DESKTOP_GUIDED_PAIRING_APPROVED
 if(value===undefined&&approval===undefined)return false
 if(value!=='true'||approval!==guidedPairingApproval||!local.available)throw Error('native_guided_opt_in_refused')
 return true
}

import {HttpError} from './contracts.ts'
// The trusted original Native authenticator throws Error(status=401) on a
// revoked/disabled session. Preserve that one closed refusal at this adapter.
// Driver, catalog and arbitrary dependency failures still become HTTP503.
export function nativeLocalAuthenticationError(error:unknown):unknown{
 const status=Object.getOwnPropertyDescriptor(error??{},'status')?.value
 const message=Object.getOwnPropertyDescriptor(error??{},'message')?.value
 return status===401&&message==='session_required'
  ?new HttpError(401,'session_required'):error
}

export const APPLICATION_FAILURE_MESSAGES: Readonly<Record<string,string>>
export function applicationFailure(job:{id?:string;status?:string;result?:unknown;error?:unknown}|null|undefined):{
 message:string
 code:string
 receipt:string
}

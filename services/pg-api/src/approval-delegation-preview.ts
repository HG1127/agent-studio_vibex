// Metadata projection for a future verified server-side delegation. This pure
// function grants no run access and must never be treated as authorization.
export type ApprovalDelegationPreview={
  values_hidden:true;field_count:number;field_names:string[];fields_truncated:boolean
  method:"GET"|"POST"|"PUT"|"PATCH"|"DELETE"|null;target_hostname:string|null
}
const methods=["GET","POST","PUT","PATCH","DELETE"] as const
export function approvalDelegationPreview(raw:unknown):ApprovalDelegationPreview{
  const empty:ApprovalDelegationPreview={values_hidden:true,field_count:0,field_names:[],fields_truncated:false,method:null,target_hostname:null}
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return empty
  const descriptors=Object.getOwnPropertyDescriptors(raw)
  const own=(name:string):unknown=>{
    const property=Object.getOwnPropertyDescriptor(descriptors,name)?.value as PropertyDescriptor|undefined
    return property?.enumerable&&Object.hasOwn(property,"value")?property.value:undefined
  }
  const names=Object.keys(descriptors).filter(name=>descriptors[name]?.enumerable).sort()
  const field_names=names.slice(0,24).map(key=>{
    const bounded=key.slice(0,60).replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g,"_")
    return /(?:password|secret|authorization|api[_-]?key|access[_-]?token|cookie|credential|private[_-]?key)/i.test(bounded)?"[保密参数]":bounded
  })
  const methodValue=own("method")??own("http_method")
  const candidate=typeof methodValue==="string"?methodValue.toUpperCase():""
  const method=methods.find(value=>value===candidate)??null
  const endpoint=own("url")??own("endpoint")??own("base_url")
  let target_hostname:string|null=null
  if(typeof endpoint==="string"&&endpoint.length<=2048)try{
    const url=new URL(endpoint)
    if(["http:","https:"].includes(url.protocol)&&/^[a-z0-9.-]{2,160}$/.test(url.hostname))target_hostname=url.hostname
  }catch{/* Invalid endpoints yield no projected value. */}
  return {values_hidden:true,field_count:names.length,field_names,fields_truncated:names.length>24,method,target_hostname}
}

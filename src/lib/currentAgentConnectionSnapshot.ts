import { getVerifiedMarketTools, type VerifiedMarketTool } from "./marketToolSelection.ts"
import type { ConnectedToolOption } from "../pages/Home/presets"

/** Fresh employee-scoped resources, not a cached grant.
 * An unavailable source is "not verified now". Saved Agent spec.tools
 * are deliberately untouched and can be repaired when the API returns.
 */
export function currentAgentConnectionSnapshot(
  httpResponse:unknown, marketResponse:unknown,
):{connectedHttp:ConnectedToolOption[];verifiedMarket:VerifiedMarketTool[]} {
  const httpBody=httpResponse&&typeof httpResponse==="object"
    ? httpResponse as Record<string,unknown> : null
  const marketBody=marketResponse&&typeof marketResponse==="object"
    ? marketResponse as Record<string,unknown> : null
  const connectedHttp:ConnectedToolOption[]=[]
  const seen=new Set<string>()
  const rows=Array.isArray(httpBody?.items)?httpBody.items.slice(0,200):[]
  for(const record of rows){
    if(!record||typeof record!=="object")continue
    const conn=record as Record<string,unknown>
    if(conn.enabled!==true||typeof conn.name!=="string")continue
    const name=conn.name.trim()
    if(!name||name.length>100||seen.has(name))continue
    seen.add(name)
    const status=String(conn.status||"untested").toLowerCase()
    connectedHttp.push({
      name,
      description:typeof conn.description==="string"?conn.description.slice(0,500):"",
      method:conn.method==="GET"?"GET":"POST",
      status:status==="ok"?"ok":status,
    })
  }
  return {
    connectedHttp,
    verifiedMarket:getVerifiedMarketTools(
      Array.isArray(marketBody?.items)?marketBody.items:null,
    ),
  }
}

/**
 * Fetch owner-scoped resource inventories independently. Failed or malformed
 * responses never inherit an earlier "verified" state from a browser cache.
 * This method reads metadata only; it performs no external tool calls.
 */
export async function fetchCurrentAgentConnectionSnapshot(
  fetcher:typeof fetch,
  base:string,
  headers:Record<string,string>,
  signal:AbortSignal,
):Promise<ReturnType<typeof currentAgentConnectionSnapshot> & {
  httpVerified:boolean
  marketVerified:boolean
}> {
  const read=async(path:string):Promise<{items:unknown[]}|null>=>{
    try {
      const response=await fetcher(base+path,{headers,signal})
      if(!response.ok||signal.aborted)return null
      const body:unknown=await response.json()
      // An abort may occur while a successful response body is being parsed.
      // Never surface a connector as verified after that revocation.
      if(signal.aborted || !body || typeof body!=="object" || Array.isArray(body))return null
      const data=body as Record<string,unknown>
      if(data.ok===false||!Array.isArray(data.items))return null
      return {items:data.items}
    }catch{return null}
  }
  const [http,market]=await Promise.all([
    read("/api/tool-connections"),
    read("/api/market/connections"),
  ])
  if(signal.aborted)return {
    ...currentAgentConnectionSnapshot(null,null),
    httpVerified:false,marketVerified:false,
  }
  return {
    ...currentAgentConnectionSnapshot(http,market),
    httpVerified:!!http,
    marketVerified:!!market,
  }
}

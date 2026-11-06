import {safeAgentSpecId} from "./toolSearchPrivacy.ts"

/** Open the exact employee-owned saved HTTP connection for hands-on testing.
 * Fallback safely to the connection list if the backend returned no record ID.
 * Never put tool names, credentials or task descriptions in a URL. */
export function toolConnectionTestRoute(
  connections:readonly {id?:string;name:string}[],
  candidateNames:readonly string[],
):string {
  for(const name of candidateNames){
    const match=connections.find(row=>row.name===name&&safeAgentSpecId(row.id||""))
    if(match?.id)return "/tool-connections?connection="+encodeURIComponent(match.id)
  }
  return "/tool-connections"
}

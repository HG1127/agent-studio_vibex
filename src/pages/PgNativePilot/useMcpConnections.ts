import {useEffect,useRef,useState} from "react"
import {PgNativePilotError,type PgNativeMcpConnection,type createPgNativePilotApi} from "@/lib/pgNativePilotApi"
// Explicit metadata reads only. No probe, storage, queue, timer or provider.
export function useMcpConnections(api:ReturnType<typeof createPgNativePilotApi>,active:boolean,onExpired:()=>void){
  const [connections,setConnections]=useState<PgNativeMcpConnection[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("")
  const lifetime=useRef<{alive:boolean;active:boolean;reading:boolean;ticket:number}|null>(null)
  useEffect(()=>{
    const token={alive:true,active,reading:false,ticket:0};lifetime.current=token
    setConnections([]);setLoading(false);setError("")
    return ()=>{token.alive=false;token.ticket++;if(lifetime.current===token)lifetime.current=null}
  },[api,active,onExpired])
  const load=async()=>{
    const token=lifetime.current
    if(!token?.alive||!token.active||token.reading)return
    token.reading=true;const ticket=++token.ticket;setLoading(true);setError("")
    try{const rows=await api.listMcpConnections();if(token.alive&&token.active&&token.ticket===ticket)setConnections(rows)}
    catch(cause){if(!token.alive||token.ticket!==ticket)return
      setConnections([])
      if(cause instanceof PgNativePilotError&&cause.status===401){onExpired();return}
      setError("暂时无法读取 MCP 连接，请核对登录和配置后重试。")
    }finally{token.reading=false;if(token.alive&&token.ticket===ticket)setLoading(false)}
  }
  return {connections,load,loading,error}
}

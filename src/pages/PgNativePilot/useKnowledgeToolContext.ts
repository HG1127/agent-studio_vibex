import {useEffect,useRef,useState} from "react"
import {PgNativePilotError,type createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {loadKnowledgeToolContext,type KnowledgeToolContext} from "@/lib/pgNativeKnowledgeTool"
// Explicit metadata reads only; an inactive or replaced view cannot retain them.
export function useKnowledgeToolContext(api:ReturnType<typeof createPgNativePilotApi>,active:boolean,onExpired:()=>void){
  const [context,setContext]=useState<KnowledgeToolContext|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState("")
  const lifetime=useRef<{alive:boolean;active:boolean;reading:boolean}|null>(null)
  useEffect(()=>{
    const token={alive:true,active,reading:false};lifetime.current=token;setContext(null);setLoading(false);setError("")
    return ()=>{token.alive=false;if(lifetime.current===token)lifetime.current=null}
  },[api,active,onExpired])
  const load=async()=>{
    const token=lifetime.current
    if(!token?.alive||!token.active||token.reading)return
    token.reading=true;setContext(null);setLoading(true);setError("")
    try{const next=await loadKnowledgeToolContext(api);if(token.alive&&token.active)setContext(next)}
    catch(cause){if(!token.alive)return
      if(cause instanceof PgNativePilotError&&cause.status===401){onExpired();return}
      setError("无法读取当前检索配置，请核对登录和检索授权后重试。")
    }finally{token.reading=false;if(token.alive)setLoading(false)}
  }
  return {context:active&&lifetime.current?.active?context:null,load,loading,error}
}

import {useEffect,useRef,useState} from 'react'
import {PgNativePilotError} from '@/lib/pgNativePilotApi'
import type {createPgNativeLocalDeviceApi,LocalDevice} from '@/lib/pgNativeLocalDevice'
export function useNativeLocalDevices(api:ReturnType<typeof createPgNativeLocalDeviceApi>,active:boolean,available:boolean,onExpired:()=>void){
 const [devices,setDevices]=useState<LocalDevice[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),ticket=useRef(0),scope=useRef({api,active,available})
 scope.current={api,active,available}
 async function load(){if(!active||!available)return;const current=++ticket.current;setLoading(true);setError('')
  try{const value=await api.list();if(ticket.current===current&&scope.current.api===api&&scope.current.active&&scope.current.available)setDevices(value)}
  catch(e){if(ticket.current===current&&scope.current.api===api&&scope.current.active){setDevices([]);setError('无法读取当前员工的本机设备。');if(e instanceof PgNativePilotError&&e.status===401)onExpired()}}
  finally{if(ticket.current===current)setLoading(false)}
 }
 useEffect(()=>{++ticket.current;setDevices([]);setLoading(false);setError('');if(active&&available)void load();return()=>{++ticket.current}},[api,active,available,onExpired])
 return{devices:active&&available?devices:[],loading,error,load}
}

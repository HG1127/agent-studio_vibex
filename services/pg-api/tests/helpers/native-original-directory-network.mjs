// Loopback containment for this explicit isolated purpose only. Installing the
// wrappers requires the original full CI guard; imports are inert.
import {createRequire,syncBuiltinESMExports} from 'node:module'
import {requireOriginalDirectoryCi} from './native-original-directory-policy.mjs'
export function originalDirectoryNetworkTarget(raw,options={}){
 try{
 let host
 if(typeof raw==='string'||raw instanceof URL){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return false;host=u.hostname}
 else if(raw&&typeof raw==='object'){if(raw.path&&raw.port===undefined)return false;host=raw.hostname??raw.host??'localhost'}
 else return false
 return typeof host==='string'&&['localhost','127.0.0.1','::1','[::1]'].includes(host)&&options.rejectUnauthorized!==false&&raw?.rejectUnauthorized!==false
 }catch{return false}
}
export function installOriginalDirectoryNetworkGuard(env=process.env){
 requireOriginalDirectoryCi(env)
 const require=createRequire(import.meta.url),http=require('node:http'),https=require('node:https'),net=require('node:net'),saved=[],counts={loopback_http_calls:0,loopback_socket_calls:0,loopback_fetch_calls:0,blocked_non_loopback_calls:0,overflow:false}
 const remember=key=>{if(counts[key]>=20000){counts.overflow=true;throw Error('original_directory_network_counter_bound')}counts[key]++}
 const checked=(raw,options,key)=>{if(!originalDirectoryNetworkTarget(raw,options)){remember('blocked_non_loopback_calls');throw Error('original_directory_non_loopback_or_TLS_bypass_refused')}remember(key)}
 function replace(object,key,value){saved.push([object,key,object[key]]);object[key]=value}
 for(const module of [http,https])for(const key of ['request','get']){const original=module[key];replace(module,key,function(...args){checked(args[0],args[1]&&typeof args[1]==='object'?args[1]:{},'loopback_http_calls');return original.apply(this,args)})}
 const connect=net.Socket.prototype.connect;replace(net.Socket.prototype,'connect',function(...args){const first=Array.isArray(args[0])?args[0][0]:args[0],options=typeof first==='object'?first:{port:first,host:typeof args[1]==='string'?args[1]:'localhost'};checked(options,{},'loopback_socket_calls');return connect.apply(this,args)})
 const fetch=globalThis.fetch;replace(globalThis,'fetch',function(input,init){checked(input instanceof Request?input.url:input,init??{},'loopback_fetch_calls');return fetch(input,init)})
 syncBuiltinESMExports();let closed=false
 return Object.freeze({snapshot:()=>Object.freeze({...counts}),restore(){if(closed)return;closed=true;for(const[o,k,v]of saved.reverse())o[k]=v;syncBuiltinESMExports()}})
}

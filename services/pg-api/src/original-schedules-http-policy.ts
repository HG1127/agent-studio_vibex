import {originalSchedulesBase,scheduleObject,scheduleId,scheduleTimestamp,scheduleInteger,OriginalSchedulesError} from '../../../shared/original-schedules-contract.ts'
import {parseAgentDesignTransportJson} from './agent-design-value-contract.ts'
const invalid=(status=400):never=>{throw new OriginalSchedulesError(status,'invalid_original_schedules_route')}
export type OriginalSchedulesRoute={kind:'capabilities'|'list'|'history'|'targets'|'target_get'|'get'|'receipt'|'change';id:string|null;filter:'all'|'active'|'disabled';limit:number;after:{at:string;id:string}|null;workflowAfter:string|null;schedule:string|null}
export function originalScheduleCursor(raw:string):{at:string;id:string}{if(!/^[A-Za-z0-9_-]{1,512}$/.test(raw))return invalid();const bytes=Buffer.from(raw,'base64url');if(bytes.toString('base64url')!==raw)return invalid();let v:Record<string,unknown>;try{v=scheduleObject(parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),['at','id'])}catch{return invalid()}return{at:scheduleTimestamp(v.at),id:scheduleId(v.id)}}
export function originalSchedulesRoute(raw:string,method:string):OriginalSchedulesRoute{
 if(raw.length>1600||/[#%\\\u0000-\u0020]/.test(raw)||raw.includes('//')||raw.endsWith('?'))return invalid();const [path,query]=raw.split('?');if(!path||raw.split('?').length>2)return invalid();const root=originalSchedulesBase,defaults={id:null,filter:'all' as const,limit:50,after:null,workflowAfter:null,schedule:null},args=new URLSearchParams(query??'')
 if((query??'')!==args.toString()||[...args.keys()].some(k=>args.getAll(k).length!==1))return invalid()
 if(method==='GET'&&path===root+'/capabilities'&&!query)return{...defaults,kind:'capabilities'}
 if(method==='POST'&&path===root+'/operations'&&!query)return{...defaults,kind:'change'}
 const receipt=new RegExp('^'+root+'/operations/([a-f0-9-]{36})$').exec(path),item=new RegExp('^'+root+'/([a-f0-9-]{36})$').exec(path)
 if(method==='GET'&&receipt&&!query)return{...defaults,kind:'receipt',id:scheduleId(receipt[1])}
 const target=new RegExp('^'+root+'/workflow-targets/([a-f0-9-]{36})$').exec(path);if(method==='GET'&&target&&!query)return{...defaults,kind:'target_get',id:scheduleId(target[1])}
 if(method==='GET'&&item&&!query)return{...defaults,kind:'get',id:scheduleId(item[1])}
 if(method!=='GET')return invalid(405)
 const kind=path===root?'list':path===root+'/history'?'history':path===root+'/workflow-targets'?'targets':null;if(kind===null)return invalid(405)
 const expected=kind==='list'?['filter','limit',...(args.has('after')?['after']:[])]:['limit',...(kind==='history'&&args.has('schedule')?['schedule']:[]),...(args.has('after')?['after']:[])]
 if([...args.keys()].join(',')!==expected.join(',')||!/^([1-9]|[1-4][0-9]|50)$/.test(args.get('limit')??''))return invalid()
 const limit=scheduleInteger(Number(args.get('limit')),1,50),filter=kind==='list'?args.get('filter'):'all';if(!['all','active','disabled'].includes(filter??''))return invalid();const after=args.get('after')
 return{...defaults,kind,limit,filter:filter as OriginalSchedulesRoute['filter'],after:after&&kind!=='targets'?originalScheduleCursor(after):null,workflowAfter:after&&kind==='targets'?scheduleId(after):null,schedule:kind==='history'&&args.has('schedule')?scheduleId(args.get('schedule')):null}
}

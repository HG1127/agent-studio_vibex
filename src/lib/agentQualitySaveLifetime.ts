import { isCompleteAgentQualityCheckSet, type AgentQualityCheck } from './agentQualityChecks.ts'
export type AgentQualitySaveTicket=Readonly<{checks:readonly AgentQualityCheck[];revision:string}>
/** Local UI admission only. The backend adapter still owns identity, CAS,
 * receipt validation and retention of unknown writes across page lifetimes. */
export function createAgentQualitySaveLifetime(){
 let scope='',scopeRevision=0,mount=0,edit=0,active=false,pending:AgentQualitySaveTicket|null=null
 const tickets=new WeakMap<AgentQualitySaveTicket,{scope:string;scopeRevision:number;mount:number;edit:number}>()
 const invalidate=()=>{edit++}
 return{
  select(owner:string,specId:string){const next=owner&&specId?JSON.stringify([owner,specId]):'';if(next!==scope){scope=next;scopeRevision++;invalidate()}},
  activate(){active=true;mount++;const life=mount;return()=>{if(mount===life){active=false;mount++;invalidate()}}},
  changed:invalidate,
  begin(revision:string,checks:unknown):AgentQualitySaveTicket|null{
   if(!active||pending||!scope||!revision||!isCompleteAgentQualityCheckSet(checks))return null
   const ticket=Object.freeze({revision,checks:Object.freeze(checks.map(check=>Object.freeze({...check})))})
   tickets.set(ticket,{scope,scopeRevision,mount,edit});pending=ticket;return ticket
  },
  finish(ticket:AgentQualitySaveTicket,saved:boolean){
   const proof=tickets.get(ticket);tickets.delete(ticket);if(pending===ticket)pending=null
   const visible=Boolean(proof&&active&&proof.scope===scope&&proof.scopeRevision===scopeRevision&&proof.mount===mount)
   return{visible,accepted:visible&&saved===true&&proof!.edit===edit}
  },
 }
}

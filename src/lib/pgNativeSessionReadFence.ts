/** A pure, deterministic fence for the standalone PostgreSQL workbench.
 * No React, cookie, network, PocketBase or browser storage dependencies.
 * Prevents an old employee's pending reads from committing after a session
 * change, and prevents an earlier refresh from overwriting a later refresh. */
export interface PgNativeReadTicket {
  session:number
  read:number
}
export function createPgNativeSessionReadFence(){
  let session=0
  let latestRead=0
  return {
    session:()=>session,
    invalidate:()=>{
      session+=1
      latestRead=0
      return session
    },
    acceptsSession:(candidate:number)=>candidate===session,
    beginRead:():PgNativeReadTicket=>({session,read:++latestRead}),
    acceptsRead:(ticket:PgNativeReadTicket)=>
      ticket.session===session&&ticket.read===latestRead,
  }
}

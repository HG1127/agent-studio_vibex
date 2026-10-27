import {preparationFixture} from "./pg18-preparation-fixture.mjs"
export async function agentCollaborationFixture(){
  const f=await preparationFixture()
  try{
    const owner=await f.ready(),session=await f.store.login("synthetic-admin@example.test","SyntheticServiceAdmin#2026")
    const recipient=await f.store.provisionEmployee(session.token,{email:"collaborator@example.test",password:"SyntheticCollaborator#2026",display_name:"Synthetic collaborator"})
    const identity=async id=>(await f.db.query("SELECT external_issuer AS issuer,external_subject AS subject FROM agentstudio.users WHERE id=$1",[id])).rows[0]
    const alice=await identity(owner.id),bob=await identity(recipient.id)
    let tail=Promise.resolve()
    const pool={async connect(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve});await previous;return {...f.api,release}}}
    return {...f,owner,session,recipient,alice,bob,pool}
  }catch(error){await f.close();throw error}
}

import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {captureFreshRuntimeSources} from "../../src/pg18-fresh-runtime-source.mjs"
import {installFreshRuntime} from "../../src/pg18-fresh-runtime-install.ts"
import {loginSqlForTest,verifyFreshForTest} from "../../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest} from "./native-pg18-embedded.mjs"
import {NativeAuthRepository} from "../../src/native-auth-repository.mjs"
import {serviceLoginTargetGuardSql} from "../../src/pg18-service-login-policy.mjs"
import {serviceLoginVerifier} from "../../src/pg18-service-login-secrets.mjs"
import {inspectPreparedServiceLogins} from "../../src/pg18-service-login-inspector.ts"
export const preparationSnapshot=captureFreshRuntimeSources(),preparationNativePassword="a0".repeat(40)
export async function preparationFixture(){
  const snapshot=preparationSnapshot,db=await PGlite.create({extensions:{vector}})
  await db.exec("CREATE DATABASE agent_studio")
  const api={async query(sql,values=[]){
    // Only this PG17 embedded test copy substitutes the exact environment
    // predicates; production guards and all catalog/data checks remain intact.
    let copy=sql
    if(sql===snapshot.steps[0].sql||sql===serviceLoginTargetGuardSql)copy=reviewedNativeSqlForEmbeddedTest(sql)
    if(sql===serviceLoginTargetGuardSql){const address="host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'"
      if(copy.split(address).length!==2)throw Error("embedded_service_address_guard_changed")
      copy=copy.replace(address,"FALSE")
    }
    return values.length?db.query(copy,values):(await db.exec(copy)).at(-1)??{rows:[]}
  }}
  try{
    await db.exec("BEGIN; SET LOCAL password_encryption='scram-sha-256'");await db.exec(snapshot.baseline.sql)
    for(const kind of ["api","worker"])await db.query("SELECT set_config($1,$2,true)",["agentstudio.bootstrap_"+kind+"_password","SyntheticFresh"+kind+"0123456789abcdefghijklmnopqrstuvwxyz"])
    await db.exec(loginSqlForTest);await verifyFreshForTest(db);await installFreshRuntime(api,snapshot);await db.exec("COMMIT")
  }catch(error){await db.close();throw error}
  const transaction=async callback=>{await db.exec("BEGIN");try{const result=await callback(api);await db.exec("COMMIT");return result}catch(error){await db.exec("ROLLBACK");throw error}}
  const rollback=async callback=>{await db.exec("BEGIN");try{return await callback(api)}finally{await db.exec("ROLLBACK")}}
  const enableNative=()=>db.exec("ALTER ROLE agentstudio_native_login LOGIN PASSWORD '"+serviceLoginVerifier(preparationNativePassword)+"'")
  const store=new NativeAuthRepository({async connect(){return {...api,release(){}}}})
  const provisionAdmin=()=>store.provisionInitialAdmin({email:"synthetic-admin@example.test",password:"SyntheticServiceAdmin#2026",display_name:"Synthetic Admin"})
  return {db,api,store,transaction,rollback,enableNative,provisionAdmin,inspect:()=>rollback(client=>inspectPreparedServiceLogins(client,snapshot)),
    async ready(){await enableNative();return await provisionAdmin()},close:()=>db.close()}
}

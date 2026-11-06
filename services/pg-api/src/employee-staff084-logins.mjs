
import {staffCompositeLogins,staffCompositeObject} from './employee-staff084-contract.mjs'
import {makeNativeScramVerifier} from './native-activation-cli.mjs'
import {validateServiceLoginPassword} from './pg18-service-login-secrets.mjs'
const additional=Object.freeze(staffCompositeLogins.slice(7)),bad=()=>{throw Error('staff_composite_extra_LOGIN_refused')}
export const staffCompositeAdditionalLogins=additional
/** Fixed original7 additions only, before the new complete receipt is sealed.
 * No supplied role/group/SQL/auditor and no existing login password rotation. */
export async function prepareStaffCompositeAdditionalLogins(db,secrets){
 staffCompositeObject(secrets,additional.map(d=>d.key))
 const actual=(await db.query('SELECT rolname FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])',[additional.map(d=>d.login)])).rows
 if(actual.length!==0)bad()
 const values=additional.map(d=>{const password=secrets[d.key];validateServiceLoginPassword(password);return password})
 if(new Set(values).size!==values.length)bad()
 for(const [i,d]of additional.entries()){
  const verifier=makeNativeScramVerifier(values[i]);if(!/^SCRAM-SHA-256\$15000:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(verifier))bad()
  await db.query('CREATE ROLE '+d.login+' LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT '+d.connection_limit+" PASSWORD '"+verifier+"'")
  for(const group of d.groups)await db.query('GRANT '+group+' TO '+d.login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
  await db.query('GRANT CONNECT ON DATABASE agent_studio TO '+d.login)
 }
}

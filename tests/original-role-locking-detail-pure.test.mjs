import test from 'node:test'
import assert from 'node:assert/strict'
import {OriginalRoleUiRepository} from '../services/pg-api/src/original-role-ui-repository.ts'
import {prepareOriginalRoleUiPool} from '../services/pg-api/src/original-role-ui-policy.ts'
import {originalSkillHash} from '../services/pg-api/src/original-role-execution.mjs'
import {frame,literalConnection,literalSupplier,startup,actor,roleEnv} from './helpers/original-role-client-frames.mjs'
test('actual original Skill detail keeps owner/current version locks in a normal transaction with no business DML',async()=>{
 const owner='00000001-1111-4111-8111-111111111111',id='abc123abc123abc',content='---\nname: analysis-method\ndescription: Reviewed immutable method\n---\nSeparate facts and hypotheses. Calculate economics from provided evidence.',item={id,name:'analysis-method',description:'Reviewed immutable method',content,version:'1',hash:originalSkillHash(content),active:true,approved:true,source_url:''}
 const db=literalConnection([...startup(),...actor(owner),frame(/current_user='agentstudio_api'/,[{ok:true}]),frame(/FOR SHARE OF s,v/,[item]),frame(/^COMMIT$/)]),pool=literalSupplier(db)
 await prepareOriginalRoleUiPool(pool,roleEnv)
 const result=await new OriginalRoleUiRepository(pool,false).detail({issuer:'urn:agentstudio:local:v1',subject:'literal-native'},owner,id,1)
 assert.equal(result.item.version,1);assert.equal(result.item.hash,item.hash);assert.equal(db.calls.filter(c=>c.sql==='BEGIN').length,1);assert.equal(db.calls.some(c=>c.sql==='BEGIN READ ONLY'),false);assert.equal(db.calls.some(c=>/INSERT INTO|UPDATE agentstudio|DELETE FROM/.test(c.sql)),false);db.done()
})

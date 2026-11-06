// Actual pure original-page host policies; no fixture/runtime is imported.
import test from 'node:test'
import assert from 'node:assert/strict'
import {originalLoginRequestPolicy as policy0} from './helpers/pg-original-login-browser-guard.mjs'
import {originalOverviewRequestPolicy as policy1} from './helpers/pg-original-internal-overview-browser-guard.mjs'
import {originalHomeDesignPolicy as policy2} from './helpers/pg-original-home-design-browser-policy.mjs'
import {originalModelDraftDiscoveryPolicy as policy3} from './helpers/pg-original-model-draft-discovery-browser-policy.mjs'
import {originalModelConnectionsPolicy as policy4} from './helpers/pg-original-model-connections-browser-policy.mjs'
import {originalModelReceipts075Policy as policy5} from './helpers/pg-original-model-receipts075-browser-policy.mjs'
import {originalRunQueuedBrowserPolicy as policy6} from './helpers/pg-original-run-queued-browser-policy.mjs'
import {originalSchedules078Policy as policy7} from './helpers/pg-original-schedules078-browser-policy.mjs'
import {originalVersionReleaseCompletionPolicy as policy8} from './helpers/pg-original-version-release-completion-browser-policy.mjs'
import {originalToolConnectionsPolicy as policy9} from './helpers/pg-original-tool-connections-browser-policy.mjs'
import {originalVersionReleasePolicy as policy10} from './helpers/pg-original-version-release-browser-policy.mjs'
import {originalInternalSharePolicy as policy11} from './helpers/pg-original-internal-share-browser-policy.mjs'
const path='/__pg_native/api/native-auth/login-status'
for(const [name,policy]of [["originalLoginRequestPolicy",policy0],["originalOverviewRequestPolicy",policy1],["originalHomeDesignPolicy",policy2],["originalModelDraftDiscoveryPolicy",policy3],["originalModelConnectionsPolicy",policy4],["originalModelReceipts075Policy",policy5],["originalRunQueuedBrowserPolicy",policy6],["originalSchedules078Policy",policy7],["originalVersionReleaseCompletionPolicy",policy8],["originalToolConnectionsPolicy",policy9],["originalVersionReleasePolicy",policy10],["originalInternalSharePolicy",policy11]]){
 test(name+': exact status GET only',()=>{assert.equal(policy('GET',path).kind,'native');for(const method of ['HEAD','POST','PATCH','DELETE','OPTIONS'])assert.notEqual(policy(method,path).kind,'native')})
 test(name+': query and encoded aliases remain denied',()=>{for(const raw of [path+'?',path+'?page=1',path+'?page=1&page=1',path.replace('login-status','%6cogin-status'),path.replace('/native-auth/','/native-auth/x/../'),path.replace('/native-auth/','//native-auth/'),path+'#fragment','https://localhost'+path,'/api/native-auth/login-status'])assert.notEqual(policy('GET',raw).kind,'native',raw)})
 test(name+': no browser claim or business route is admitted by the added branch',()=>{for(const raw of [path+'/extra',path+'-extra',path+'?owner=browser-owner','/__pb/api/native-auth/login-status','/__pg/api/native-auth/login-status'])assert.notEqual(policy('GET',raw).kind,'native',raw)})
}

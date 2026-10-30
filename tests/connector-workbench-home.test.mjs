import test from 'node:test'
import assert from 'node:assert/strict'
import {workbenchForProfile} from '../local-executor/ui/workbench-home.js'
const id='a'.repeat(24)
test('workbench navigation names one existing device without any permission token',()=>{
 assert.equal(workbenchForProfile({id,server:'http://127.0.0.1:8180/__pb'}),'http://127.0.0.1:8180/tool-hub?view=devices&device='+id)
 assert.equal(workbenchForProfile({id,server:'https://studio.example.test/__pb/'}),'https://studio.example.test/tool-hub?view=devices&device='+id)
})
test('workbench navigation rejects arbitrary local URLs, credentials and malformed identifiers',()=>{
 for(const server of ['javascript:alert(1)','file:///tmp/file','http://evil.example.test/__pb','https://u:p@example.test','https://example.test/__pb?token=x','https://example.test/path','https://example.test/#secret'])assert.equal(workbenchForProfile({id,server}),null)
 assert.equal(workbenchForProfile({id:'../escape',server:'http://127.0.0.1:8180'}),null)
})

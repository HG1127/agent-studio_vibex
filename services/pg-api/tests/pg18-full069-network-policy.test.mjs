import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {full069NetworkPolicyDigest as digest} from '../src/pg18-full069-network-policy.mjs'
const baseline='*filter\n:INPUT ACCEPT [0:0]\n:OUTPUT DROP [0:0]\n:AS_F069 - [0:0]\n-A OUTPUT -m owner --uid-owner 61001 -j AS_F069\n-A AS_F069 -d 127.0.0.0/8 -j RETURN\n-A AS_F069 -j REJECT\nCOMMIT\n---\n*filter\n:OUTPUT ACCEPT [0:0]\nCOMMIT'
test('zero-counter snapshot retains the exact original digest and every separator',()=>assert.equal(digest(baseline),createHash('sha256').update(baseline).digest('hex')))
test('only exact chain traffic counts normalize, including both IP families and large decimal counters',()=>{const changed=baseline.replace(':INPUT ACCEPT [0:0]',':INPUT ACCEPT [398:48220]').replace(':OUTPUT DROP [0:0]',':OUTPUT DROP [12:90071992547409931234567890]').replace(':AS_F069 - [0:0]',':AS_F069 - [80:2048]').replace(':OUTPUT ACCEPT [0:0]',':OUTPUT ACCEPT [1:90]');assert.equal(digest(changed),digest(baseline));assert.notEqual(createHash('sha256').update(changed).digest('hex'),createHash('sha256').update(baseline).digest('hex'))})
for(const [name,change]of[
 ['default policy',v=>v.replace(':OUTPUT DROP',':OUTPUT ACCEPT')],
 ['UID scope',v=>v.replace('61001','61002')],
 ['destination',v=>v.replace('127.0.0.0/8','0.0.0.0/0')],
 ['verdict',v=>v.replace('-j REJECT','-j ACCEPT')],
 ['rule order',v=>v.replace('-A AS_F069 -d 127.0.0.0/8 -j RETURN\n-A AS_F069 -j REJECT','-A AS_F069 -j REJECT\n-A AS_F069 -d 127.0.0.0/8 -j RETURN')],
 ['added rule',v=>v.replace('COMMIT','-A OUTPUT -j ACCEPT\nCOMMIT')],
 ['removed rule',v=>v.replace('-A AS_F069 -j REJECT\n','')],
 ['rule counters and unknown options',v=>v.replace('--uid-owner 61001','--uid-owner 61001 -c 12 1024')],
 ['chain name',v=>v.replaceAll('AS_F069','AS_OTHER')],
 ['table name',v=>v.replace('*filter','*raw')],
 ['family separator',v=>v.replace('\n---\n','\n--\n')],
 ['unknown text',v=>v+'\nunknown-policy-metadata'],
])test('policy digest still binds '+name,()=>assert.notEqual(digest(change(baseline)),digest(baseline)))
test('malformed or nonexact chain syntax is never stripped or normalized',()=>{for(const line of[':OUTPUT DROP [01:2]',':OUTPUT DROP [-1:2]',':OUTPUT DROP [1:2] ',':OUTPUT DROP [1:2] extra',' :OUTPUT DROP [1:2]',':OUTPUT QUEUE [1:2]',':OUTPUT DROP [1:2]\r',':OUTPUT DROP [1:2:3]']){const snapshot=baseline.replace(':OUTPUT DROP [0:0]',line);assert.equal(digest(snapshot),createHash('sha256').update(snapshot).digest('hex'));assert.notEqual(digest(snapshot),digest(baseline))}})
test('input bounds reject nontext, NUL and oversized snapshots without coercion',()=>{for(const input of[null,{},Buffer.from('x'),'x\0y','a'.repeat(2097153)])assert.throws(()=>digest(input),/snapshot_refused/);assert.doesNotThrow(()=>digest('a'.repeat(2097152)))})

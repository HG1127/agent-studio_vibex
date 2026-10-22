import test from "node:test"
import assert from "node:assert/strict"
import {TLSSocket} from "node:tls"
import {verifyBoundWorkerMutualTlsPeer}
  from "../src/bound-worker-mtls.ts"

const pin="AB".repeat(32)
const fingerprint=new Array(32).fill("AB").join(":")
// Synthetic TLSSocket interface fixture only, NOT evidence of a genuine TLS
// handshake. The actual HTTPS server/CA and client certificate still need UAT.
function peer({authorized=true,encrypted=true,raw=Buffer.alloc(32,1),
  presentedFingerprint=fingerprint}={}){
  const socket=Object.create(TLSSocket.prototype)
  Object.defineProperties(socket,{
    authorized:{value:authorized,configurable:true},
    encrypted:{value:encrypted,configurable:true},
    getPeerCertificate:{value:()=>({raw,fingerprint256:presentedFingerprint})}
  })
  return socket
}
test("pinned, TLS-authorized client certificate is admitted",()=>{
  assert.equal(verifyBoundWorkerMutualTlsPeer(peer(),pin),true)
  assert.equal(verifyBoundWorkerMutualTlsPeer(peer(),pin.toLowerCase()),true)
})
test("no valid TLS peer, no authorization, wrong pin or missing certificate is always denied",()=>{
  for(const fake of [
    null,{}, {authorized:true,encrypted:true,getPeerCertificate:()=>({
      raw:Buffer.alloc(32,1),fingerprint256:fingerprint})},
    peer({authorized:false}),peer({encrypted:false}),
    peer({raw:Buffer.alloc(0)}),peer({presentedFingerprint:"CD".repeat(32)}),
  ])assert.throws(()=>verifyBoundWorkerMutualTlsPeer(fake,pin),
    /bound_dispatch_tls_peer_refused/)
})
test("malformed pins and malformed peer certificate fingerprints fail closed",()=>{
  for(const bad of ["","not-a-pin","a".repeat(63),"X".repeat(64),
    "AB::".repeat(16),"AB:".repeat(32)])
    assert.throws(()=>verifyBoundWorkerMutualTlsPeer(peer(),bad),
      /bound_dispatch_tls_peer_refused/)
  for(const presentedFingerprint of [null,"","ABC","GG".repeat(32)])
    assert.throws(()=>verifyBoundWorkerMutualTlsPeer(
      peer({presentedFingerprint}),pin),/bound_dispatch_tls_peer_refused/)
})
test("HTTP user identity headers never substitute for a real mTLS TLSSocket",()=>{
  const forged={headers:{"x-rh-user-id":"alice","x-forwarded-client-cert":pin},
    encrypted:true,authorized:true,getPeerCertificate:()=>({
      raw:Buffer.alloc(32,1),fingerprint256:fingerprint,
    })}
  assert.throws(()=>verifyBoundWorkerMutualTlsPeer(forged,pin),
    /bound_dispatch_tls_peer_refused/)
})

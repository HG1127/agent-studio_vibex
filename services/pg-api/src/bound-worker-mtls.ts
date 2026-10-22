// Internal Worker->Broker mTLS peer admission prerequisite, not a listener.
// A future dedicated HTTPS server MUST set requestCert:true,
// rejectUnauthorized:true, bind only a reviewed isolated interface, and call
// this check on its ACTUAL req.socket before reading any request data.
// Do not use proxy headers/cookies/user IDs as authentication. No secrets or
// employee identities are ever derived from certificate subjects alone.
import {timingSafeEqual} from "node:crypto"
import {TLSSocket} from "node:tls"

function invalid():never{throw Error("bound_dispatch_tls_peer_refused")}
export function boundCertificateFingerprint(input:unknown):Buffer{
  if(typeof input!=="string")invalid()
  // Operator pin is a SHA-256 certificate fingerprint in plain 64-char hex;
  // Node's X509 fingerprint256 additionally supports colon separators.
  const text=input.includes(":")?
    (/^([a-fA-F0-9]{2}:){31}[a-fA-F0-9]{2}$/.test(input)?
      input.replaceAll(":",""):invalid()):
    input
  if(!/^[0-9a-fA-F]{64}$/.test(text))invalid()
  return Buffer.from(text,"hex")
}
export function verifyBoundWorkerMutualTlsPeer(
  socket:unknown,reviewedClientFingerprint256:string,
):true{
  const expected=boundCertificateFingerprint(reviewedClientFingerprint256)
  // instanceof rejects HTTP sockets and simulated 'authorized' request
  // headers or user-created plain objects with lookalike attributes.
  if(!(socket instanceof TLSSocket)||socket.encrypted!==true||
     socket.authorized!==true||typeof socket.getPeerCertificate!=="function")
    invalid()
  let cert
  try{cert=socket.getPeerCertificate(true)}
  catch{invalid()}
  if(!cert||!Buffer.isBuffer(cert.raw)||cert.raw.length===0)invalid()
  const actual=boundCertificateFingerprint(cert.fingerprint256)
  if(!timingSafeEqual(expected,actual))invalid()
  return true
}

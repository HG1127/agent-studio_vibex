import test from "node:test"
import assert from "node:assert/strict"
import {
  createLocalJWKSet,exportJWK,generateKeyPair,SignJWT,
} from "jose"
import {createJwtVerifier,createOidcVerifier} from "../src/auth.ts"

test("real RS256 signature, issuer and audience verification without network",async()=>{
  const {publicKey,privateKey}=await generateKeyPair("RS256",{extractable:true})
  const jwk=await exportJWK(publicKey)
  jwk.kid="stage-test-1"
  jwk.alg="RS256"
  const keys=createLocalJWKSet({keys:[jwk]})
  const issuer="https://identity.internal.example"
  const audience="agent-studio-internal"
  const verify=createJwtVerifier({issuer,audience},keys)
  const sign=(claims,params={})=>new SignJWT(claims)
    .setProtectedHeader({alg:"RS256",kid:"stage-test-1"})
    .setIssuer(params.issuer||issuer)
    .setAudience(params.audience||audience)
    .setIssuedAt()
    .setExpirationTime(params.expires||"5m")
    .sign(privateKey)
  const valid=await sign({sub:"member-a"})
  assert.deepEqual(await verify(valid),{issuer,subject:"member-a"})
  await assert.rejects(verify(await sign({sub:"member-a"},{issuer:"https://impostor.example"})))
  await assert.rejects(verify(await sign({sub:"member-a"},{audience:"another-app"})))
  await assert.rejects(verify(await sign({sub:"member-a"},{expires:"-2h"})))
  const noExpiry=await new SignJWT({sub:"member-a"}).setProtectedHeader({
    alg:"RS256",kid:"stage-test-1",
  }).setIssuer(issuer).setAudience(audience).setIssuedAt().sign(privateKey)
  await assert.rejects(verify(noExpiry),/access_token_expiry_required/)
  const oldIssued=await new SignJWT({sub:"member-a"}).setProtectedHeader({
    alg:"RS256",kid:"stage-test-1",
  }).setIssuer(issuer).setAudience(audience)
    .setIssuedAt(Math.floor(Date.now()/1000)-7200)
    .setExpirationTime("5m").sign(privateKey)
  await assert.rejects(verify(oldIssued))

  await assert.rejects(verify(await sign({role:"admin"})),/invalid_verified_identity/)
  const unsigned=valid.slice(0,valid.lastIndexOf(".")+1)
  await assert.rejects(verify(unsigned))
})

test("fake signed user claims cannot use a different cryptographic key",async()=>{
  const first=await generateKeyPair("RS256",{extractable:true})
  const second=await generateKeyPair("RS256",{extractable:true})
  const jwk=await exportJWK(first.publicKey)
  jwk.alg="RS256";jwk.kid="stage"
  const keys=createLocalJWKSet({keys:[jwk]})
  const verify=createJwtVerifier({issuer:"https://id.example",audience:"team-api"},keys)
  const forged=await new SignJWT({sub:"other-employee"}).setIssuer("https://id.example")
    .setAudience("team-api").setIssuedAt().setExpirationTime("5m")
    .setProtectedHeader({alg:"RS256",kid:"stage"}).sign(second.privateKey)
  await assert.rejects(verify(forged))
})

test("Production JWKS configuration must be HTTPS and same origin as issuer",()=>{
  assert.throws(()=>createOidcVerifier({
    issuer:"http://id.internal",audience:"api",jwksUrl:"http://id.internal/jwks",
  }),/unsafe_oidc_configuration/)
  assert.throws(()=>createOidcVerifier({
    issuer:"https://id.internal",audience:"api",jwksUrl:"https://evil.example/jwks",
  }),/unsafe_oidc_configuration/)
  assert.throws(()=>createOidcVerifier({
    issuer:"https://id.internal",audience:"api",jwksUrl:"https://id.internal/jwks?token=x",
  }),/unsafe_oidc_configuration/)
})

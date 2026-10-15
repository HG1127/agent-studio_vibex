import { createRemoteJWKSet,jwtVerify } from "jose"
import type { Identity } from "./contracts.ts"

export interface OidcSettings {
  issuer:string
  audience:string
  jwksUrl:string
}
// Injectable JWK source permits fully offline cryptographic tests.
export function createJwtVerifier(
  settings:Pick<OidcSettings,"issuer"|"audience">,
  keys:Parameters<typeof jwtVerify>[1],
) {
  return async (token:string):Promise<Identity>=>{
    const verified=await jwtVerify(token,keys,{
      issuer:settings.issuer,
      audience:settings.audience,
      algorithms:["RS256","ES256"],
      clockTolerance:5,
      maxTokenAge:"1h",
    })
    if(!Number.isSafeInteger(verified.payload.exp)) throw new Error("access_token_expiry_required")
    const subject=verified.payload.sub
    const issuer=verified.payload.iss
    if(!subject || subject.length>255 || !issuer)
      throw new Error("invalid_verified_identity")
    return {issuer,subject}
  }
}

export function createOidcVerifier(settings:OidcSettings) {
  const issuerUrl=new URL(settings.issuer)
  const jwksUrl=new URL(settings.jwksUrl)
  if(issuerUrl.protocol!=="https:" || jwksUrl.protocol!=="https:" ||
     issuerUrl.origin!==jwksUrl.origin ||
     issuerUrl.username || issuerUrl.password ||
     jwksUrl.username || jwksUrl.password || jwksUrl.search || jwksUrl.hash ||
     !settings.audience || settings.audience.length>250)
    throw new Error("unsafe_oidc_configuration")

  const keys=createRemoteJWKSet(jwksUrl,{
    timeoutDuration:5000,
    cooldownDuration:60000,
    cacheMaxAge:600000,
  })
  return createJwtVerifier(settings,keys)
}

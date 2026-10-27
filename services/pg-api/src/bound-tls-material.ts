// Pure TLS material validation shared by independent private services.
import {createPrivateKey,X509Certificate} from "node:crypto"
function refuse():never{throw Error("unsafe_bound_dispatch_server_config")}
export function assertBoundDispatchTlsMaterial(
  ca:Buffer,cert:Buffer,key:Buffer,now=Date.now(),
):void{
  try{
    const certificates=ca.toString("utf8").match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
    if(!certificates?.length)refuse()
    const authorities=certificates.map(pem=>new X509Certificate(pem))
    const server=new X509Certificate(cert)
    for(const item of [...authorities,server]){
      const from=Date.parse(item.validFrom),to=Date.parse(item.validTo)
      if(!Number.isFinite(from)||!Number.isFinite(to)||from>now||to<=now)refuse()
    }
    if(authorities.some(item=>!item.ca)||server.ca||
       !server.checkHost("localhost")||!server.checkIP("127.0.0.1")||
       !server.checkPrivateKey(createPrivateKey(key))||
       !authorities.some(item=>server.verify(item.publicKey))||
       !server.keyUsage?.includes("1.3.6.1.5.5.7.3.1"))refuse()
  }catch{refuse()}
}

import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {
  acceptsNativePg18Credential,assertNativePg18Credential,
  expectedNativePg18Secret,nativePg18CredentialDirectory
} from "../src/native-credential-policy.ts"
import {nativeRuntimeCredentialConfig,nativePg18ServerConfig} from "../src/native-server.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const directory="/run/credentials/agentstudio-pg18-native.service"
function expected(name="api.secret"){
  const file=expectedNativePg18Secret(name)
  return {
    name,file,uid:60001,canRead:true,
    env:{
      CREDENTIALS_DIRECTORY:directory,
      AGENT_STUDIO_PG_PASSWORD_FILE:directory+"/api.secret",
      AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:directory+"/native-auth.secret",
    },
    stat:{isFile:()=>true,isSymbolicLink:()=>false,
      uid:0,gid:0,mode:0o100440,size:96}
  }
}
test("systemd root:root 0440+nonroot readable credential accepted ONLY for both native secrets",()=>{
  assert.equal(nativePg18CredentialDirectory,directory)
  for(const name of ["api.secret","native-auth.secret"]){
    const input=expected(name)
    assert.equal(acceptsNativePg18Credential(input),true,name)
    assert.doesNotThrow(()=>assertNativePg18Credential(input))
  }
})

test("ordinary 0400/0600 secrets only allowed when owned by the exact dynamic UID",()=>{
  for(const name of ["api.secret","native-auth.secret"])
    for(const mode of [0o400,0o600]){
      const p=expected(name)
      p.stat={...p.stat,mode,uid:p.uid,gid:p.uid}
      assert.equal(acceptsNativePg18Credential(p),true)
      assert.equal(acceptsNativePg18Credential({
        ...p,stat:{...p.stat,uid:0,gid:0}
      }),false)
    }
})

test("0440 exception rejects group-write, world access, altered owners, special mode bits",()=>{
  const expectedMode=0o440
  for(const mode of [0o440,0o400,0o444,0o460,0o640,0o604,
    0o660,0o777,0o2440,0o4440,0o540,0o740]){
    const p=expected()
    p.stat={...p.stat,mode}
    assert.equal(acceptsNativePg18Credential(p),mode===expectedMode,
      "mode="+mode.toString(8))
  }
  for(const [owner,group,read] of [
    [60001,0,true],[0,60001,true],[1234,1234,true],[0,0,false]
  ]){
    const p=expected()
    p.stat={...p.stat,uid:owner,gid:group}
    p.canRead=read
    assert.equal(acceptsNativePg18Credential(p),false)
  }
})

test("exact service name, directory and separate role credential paths are mandatory",()=>{
  const p=expected()
  const variants=[
    {...p,file:"/root/.agentstudio-pg18-secrets/api.secret"},
    {...p,file:"%d/api.secret"},
    {...p,file:directory+"/native-auth.secret"},
    {...p,env:{...p.env,CREDENTIALS_DIRECTORY:"/run/credentials/other.service"}},
    {...p,env:{...p.env,AGENT_STUDIO_PG_PASSWORD_FILE:"%d/api.secret"}},
    {...p,env:{...p.env,AGENT_STUDIO_PG_PASSWORD_FILE:"/tmp/api.secret"}},
    {...p,env:{...p.env,AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:
      directory+"/api.secret"},name:"native-auth.secret",
      file:directory+"/native-auth.secret"},
    {...p,name:"unexpected.secret"},
    {...p,uid:0},{...p,uid:-1},{...p,uid:undefined},
  ]
  for(const v of variants){
    assert.equal(acceptsNativePg18Credential(v),false)
    assert.throws(()=>assertNativePg18Credential(v),/unsafe_native_pg18_credential/)
  }
})

test("file type, symlink, size, invalid numeric metadata or effective read failure block access",()=>{
  const p=expected()
  const variants=[
    {...p,stat:{...p.stat,isFile:()=>false}},
    {...p,stat:{...p.stat,isSymbolicLink:()=>true}},
    {...p,stat:{...p.stat,size:39}},
    {...p,stat:{...p.stat,size:513}},
    {...p,stat:{...p.stat,mode:NaN}},
    {...p,stat:{...p.stat,uid:NaN}},
    {...p,stat:{...p.stat,gid:NaN}},
    {...p,stat:{...p.stat,size:NaN}},
    {...p,canRead:false},
  ]
  for(const v of variants)
    assert.equal(acceptsNativePg18Credential(v),false)
})

test("native server config distinguishes root-only preflight from exact nonroot service env",()=>{
  const p=expected()
  const baseline={
    AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED:"true",
    AGENT_STUDIO_PG_NATIVE_REVIEWED:"true",
    AGENT_STUDIO_PG_PILOT_ENABLED:"true",
    AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
    AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"true",
    AGENT_STUDIO_PG_HOST:"127.0.0.1",
    AGENT_STUDIO_PG_PORT:"5333",
    AGENT_STUDIO_PG_DATABASE:"agent_studio",
    AGENT_STUDIO_PG_USER:"agentstudio_stage_login",
    AGENT_STUDIO_PG_NATIVE_AUTH_USER:"agentstudio_native_login",
    AGENT_STUDIO_INTERNAL_APP_ORIGIN:"https://studio.test",
    AGENT_STUDIO_PG_PASSWORD_FILE:"/root/.agentstudio-pg18-secrets/api.secret",
    AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:"/root/.agentstudio-pg18-secrets/native-auth.secret"
  }
  const live={...baseline,...p.env}
  assert.deepEqual(nativeRuntimeCredentialConfig(live,true,60001),{
    apiFile:directory+"/api.secret",
    authFile:directory+"/native-auth.secret",credentialDir:directory
  })
  const approved=nativePg18ServerConfig(live,"linux",true,60001)
  assert.equal(approved.apiFile,directory+"/api.secret")
  assert.equal(approved.authFile,directory+"/native-auth.secret")
  assert.equal(approved.api.user,"agentstudio_stage_login")
  assert.equal(approved.user,"agentstudio_native_login")
  assert.throws(()=>nativePg18ServerConfig(baseline,"linux",true,60001),
    /unsafe_native_pg18_server_config/)
  assert.throws(()=>nativePg18ServerConfig(live,"linux",true,0),
    /unsafe_native_pg18_server_config/)
  assert.throws(()=>nativePg18ServerConfig(live,"linux",false,0),
    /unsafe_native_pg18_server_config/)
  assert.equal(nativePg18ServerConfig(baseline,"linux",false,0).apiFile,
    "/root/.agentstudio-pg18-secrets/api.secret")
})

test("service source never rewrites supplied systemd env back to root vault",()=>{
  const native=readFileSync(path.join(root,
    "services/pg-api/src/native-server.ts"),"utf8")
  const service=readFileSync(path.join(root,
    "ops/templates/agentstudio-pg18-native.service.example"),"utf8")
  assert.match(native,/nativePg18ServerConfig\(env,process\.platform,credentialMode\)/)
  assert.match(native,/assertNativePg18Credential/)
  assert.match(native,/accessSync\(file,constants\.R_OK\)/)
  assert.doesNotMatch(native,/AGENT_STUDIO_PG_PASSWORD_FILE:rootVault/)
  assert.match(service,/Environment=AGENT_STUDIO_PG_PASSWORD_FILE=\/run\/credentials\/agentstudio-pg18-native\.service\/api\.secret/)
  assert.match(service,/Environment=AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE=\/run\/credentials\/agentstudio-pg18-native\.service\/native-auth\.secret/)
  assert.doesNotMatch(service,/^Environment=.*%d\//m)
  assert.doesNotMatch(service,/^\[Install\]$/m)
})

import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=name=>readFileSync(path.join(root,name),"utf8")

test("standalone PG18 HTTPS template serves Vite hashed assets and only read-only native APIs",()=>{
  const site=read("ops/templates/agentstudio-pg18-standalone-7443.conf.example")
  assert.match(site,/listen 192\.168\.1\.133:7443 ssl;/)
  assert.match(site,/subjectAltName=IP:192\.168\.1\.133/)
  assert.match(site,/root \/opt\/agentstudio-pg18-native-preview\/www;/)
  assert.match(site,/location \^~ \/assets\/\s*\{/)
  assert.match(site,/location = \/index\.html\s*\{/)
  assert.match(site,/location = \/api\/native-auth\/employees \{ return 403;/)
  assert.match(site,/location \^~ \/api\/v2\/runs \{ return 404;/)
  assert.match(site,/location ~ \^\/api\/v2\/knowledge-bases\/\[0-9A-Fa-f-\]\{36\}\/search\$/)
  assert.match(site,/limit_except POST \{ deny all; \}/)
  assert.match(site,/location \/api\/v2\/ \{\s*limit_except GET \{ deny all; \}/)
  assert.doesNotMatch(site,/location \^~ \/api\/v2\/ \{/,
    "prefix must not bypass the precise POST keyword-search regex")
  assert.match(site,/proxy_pass http:\/\/127\.0\.0\.1:7403;/)
  assert.match(site,/proxy_set_header X-Rh-User-Id "";/)
  assert.match(site,/proxy_cache off;/)
  assert.match(site,/access_log off;/)
  assert.match(site,/default-src 'none'/)
  assert.match(site,/autoindex off;/)
  assert.doesNotMatch(site,/proxy_pass.*(?:(?:8090|5333)|pocketbase)/i)
  assert.doesNotMatch(site,/\b(?:ssl_verify_client off|proxy_ssl_verify off)\b/)
  assert.doesNotMatch(site,/^\s*listen (?:80|443|82|8090)\s*;/m)
})

test("actual systemd nonroot readonly credential check fails before any socket without explicit approval",()=>{
  const source=path.join(root,"services/pg-api/src/native-server.ts")
  const entry=read("services/pg-api/src/native-server.ts")
  assert.match(entry,/--preflight-nonroot/)
  assert.match(entry,/credential_mode:credentialMode\?"systemd_nonroot":"root_offline"/)
  assert.match(entry,/assertNativeServeOrigin\(cfg\.allowedOrigin,credentialMode\)/)
  assert.match(entry,/const capabilities=selectNativePg18UatCapabilities\(\s*env,listen/)
  const readonly=entry.indexOf("if(!listen){",entry.indexOf("export async function startNativePg18Server"))
  const bind=entry.indexOf('localServer.listen(',readonly)
  assert.ok(readonly>0 && bind>readonly)
  const fail=spawnSync(process.execPath,[
    "--experimental-strip-types",source,"--preflight-nonroot"
  ],{encoding:"utf8",timeout:12000,env:{
    PATH:process.env.PATH??"",HOME:process.env.HOME??"",
    DATABASE_URL:"postgres://127.0.0.1:5333/agent_studio"
  }})
  assert.equal(fail.status,1)
  assert.equal(fail.stdout,"")
  assert.match(fail.stderr,/native_server_start_refused/)
  assert.doesNotMatch(fail.stderr,/ECONNREFUSED|password authentication failed/)
  const service=read("ops/templates/agentstudio-pg18-native.service.example")
  assert.match(service,/DynamicUser=yes/)
  assert.match(service,/LoadCredential=api\.secret:/)
  assert.match(service,/LoadCredential=native-auth\.secret:/)
  assert.match(service,/Environment=AGENT_STUDIO_INTERNAL_APP_ORIGIN=https:/)
  assert.match(service,/IPAddressDeny=any/)
  assert.match(service,/IPAddressAllow=127\.0\.0\.0\/8/)
  assert.doesNotMatch(service,/^\[Install\]$/m)
})
test("opt-in Native config-write vhost permits only Agent/Workflow/KB metadata routes",()=>{
  const site=read("ops/templates/agentstudio-pg18-config-write-7443.conf.example")
  assert.match(site,/listen 192\.168\.1\.133:7443 ssl;/)
  assert.match(site,/location ~ "\^\/api\/v2\/\(agent-specs\|workflows\|knowledge-bases\)\$"/)
  assert.match(site,/location ~ "\^\/api\/v2\/\(agent-specs\|workflows\|knowledge-bases\)\/\[0-9a-fA-F-\]\{36\}\$"/)
  assert.match(site,/limit_except GET POST \{ deny all; \}/)
  assert.match(site,/limit_except GET PATCH \{ deny all; \}/)
  assert.match(site,/location \/api\/v2\/ \{\s*limit_except GET \{ deny all; \}/)
  assert.match(site,/location \^~ \/api\/v2\/runs \{ return 404; \}/)
  assert.match(site,/location = \/api\/native-auth\/employees \{ return 403;/)
  assert.match(site,/proxy_set_header X-Rh-User-Id "";/)
  assert.doesNotMatch(site,/location \^~ \/api\/v2\/ \{/)
  // Audit method allowances per directive, not a cross-block /s regex:
  // /api/v2/runs is intentionally listed as a denied location above.
  const methodRules=site.split(/\r?\n/).map(line=>line.trim())
    .filter(line=>line.startsWith("limit_except "))
  const permittedMethods=[
    "limit_except GET POST { deny all; }", // Native auth login/logout
    "limit_except POST { deny all; }", // Bounded read-only KB search
    "limit_except GET POST { deny all; }", // Three config collections
    "limit_except GET PATCH { deny all; }", // Config UUID records
    "limit_except GET { deny all; }", // Everything else
  ]
  assert.deepEqual(methodRules.sort(),permittedMethods.sort())
  const locationLines=site.split(/\r?\n/).map(line=>line.trim())
    .filter(line=>line.startsWith("location "))
  assert.ok(locationLines.every(line=>
    !/\/(document-files|text-documents|model-approval)(?:[\/$"]|$)/.test(line)),
    "no upload, task approval or ingestion location is permitted")
  assert.doesNotMatch(site,/proxy_pass.*(?:(?:8090|5333)|pocketbase)/i)
  const base=read("ops/templates/agentstudio-pg18-standalone-7443.conf.example")
  assert.match(base,/location \/api\/v2\/ \{\s*limit_except GET \{ deny all; \}/)
  assert.doesNotMatch(base,/location ~ "\^\/api\/v2\/\(agent-specs\|workflows\|knowledge-bases\)/)
})

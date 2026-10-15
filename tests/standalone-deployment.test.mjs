import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("isolated company deployment examples retain loopback PB and worker separation",()=>{
 const gateway=fs.readFileSync("deploy/standalone/nginx-agent-studio.conf.example","utf8")
 const pb=fs.readFileSync("deploy/standalone/agent-studio-pocketbase.service.example","utf8")
 const worker=fs.readFileSync("deploy/standalone/agent-studio-worker.service.example","utf8")
 assert.match(gateway,/ssl_certificate\s+/)
 assert.match(gateway,/proxy_pass http:\/\/127\.0\.0\.1:7000\//)
 assert.match(gateway,/location \^~ \/__pb\/_\//)
 assert.match(gateway,/location \^~ \/__pb\/api\/collections\/_superusers\//)
 assert.match(gateway,/proxy_set_header X-Rh-User-Id "";/)
 assert.match(gateway,/proxy_set_header X-Agent-Studio-Worker-Token "";/)
 assert.match(pb,/serve --http=127\.0\.0\.1:7000/)
 assert.match(pb,/EnvironmentFile=\/etc\/agent-studio\/studio\.env/)
 assert.match(worker,/After=agent-studio-pocketbase\.service/)
 assert.match(worker,/EnvironmentFile=\/etc\/agent-studio\/studio\.env/)
 assert.doesNotMatch(pb+worker,/RunningHub|VIBEX_APP_ID|AGENT_STUDIO_ALLOW_ANON=true/)
})

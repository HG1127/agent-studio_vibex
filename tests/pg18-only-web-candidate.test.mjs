import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const read=rel=>fs.readFileSync(path.join(root,rel),"utf8")
test("PG-only trial React app never imports legacy PocketBase authentication",()=>{
  const main=read("pg18-app/main.tsx")
  const html=read("pg18-app/index.html")
  assert.match(main,/PgNativePilotPage productionRoot/)
  assert.match(main,/createRoot/)
  const imports=main.split("\n").filter(line=>/^import\s/.test(line)).join("\n")
  assert.doesNotMatch(imports,/studioAuth|lib\/pb|pocketbase|src\/App|studio_users/i)
  assert.doesNotMatch(main,/\b(?:pb\.collection|pb\.authStore|getPocketBaseUrl)\s*\(/)
  assert.match(html,/id="root"/)
  assert.match(html,/\/main\.tsx/)
})
test("PG trial Vite output never replaces existing 8090 dist",()=>{
  const config=read("vibex-local/vite.pg18.config.ts")
  assert.match(config,/dist-pg18/)
  assert.match(config,/pg18-app/)
  assert.match(config,/publicDir:false/)
  assert.match(config,/sourcemap:false/)
  assert.doesNotMatch(config,/outDir:\s*["']dist["']/)
  const pkg=JSON.parse(read("package.json"))
  assert.match(pkg.scripts["build:pg18:trial"],/vite\.pg18\.config\.ts/)
  assert.match(pkg.scripts["build:pg18:trial"],/verify-pg18-only-web-build\.mjs/)
  assert.match(pkg.scripts["pg18:cutover-gate"],/--assert-ready/)
})
test("PG-only trial UI blocks credential requests on HTTP",()=>{
  const page=read("src/pages/PgNativePilot/PgNativePilotPage.tsx")
  assert.match(page,/productionRoot/)
  assert.match(page,/window\.location\.protocol!=="https:"/)
  assert.match(page,/setPassword\(""\)/)
  assert.match(page,/productionRoot\?"":"\/__pg_native"/)
  // Approved configuration editing is available in the independent build;
  // a browser flag alone must never grant it on the production root.
  assert.match(page,/canEditConfig=!productionRoot\|\|configEditEnabled/)
  assert.match(page,/setConfigEditEnabled\(productionRoot&&capability\?\.config_writes_enabled===true\)/)
})
test("PG-only bundle verifier rejects old web auth routes",()=>{
  const file=read("ops/verify-pg18-only-web-build.mjs")
  assert.match(file,/pocketbase_proxy/)
  assert.match(file,/LocalAuthStore/)
  assert.match(file,/studio_users/)
  assert.match(file,/pg_native_login_present:true/)
  assert.match(file,/production_cutover_allowed:false/)
})

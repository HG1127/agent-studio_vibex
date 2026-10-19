import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildLanBundle, allowlistedReleasePath } from "../deploy/lan/build-lan-bundle.mjs";

test("LAN release packer includes only allowlisted runtime and dist", () => {
  const root = mkdtempSync(path.join(tmpdir(), "agentstudio-lan-build-"));
  const source = path.join(root, "source");
  const out = path.join(root, "release");
  mkdirSync(source);
  const put = (filename, content) => {
    const p = path.join(source, filename);
    mkdirSync(path.dirname(p), {recursive:true});
    writeFileSync(p,content);
  };
  const git = (...args) => execFileSync("git", args, {cwd:source,encoding:"utf8"}).trim();
  try {
    git("init","-q");
    git("config","user.email","lan-ci@example.invalid");
    git("config","user.name","Agent Studio Test");
    put("package.json",'{"type":"module"}');
    put("worker/run.mjs","console.log('worker');");
    put("src/lib/scheduleTime.js","export const x=1;");
    put("pocketbase/pb_hooks/main.pb.js","// synthetic only");
    git("add",".");
    git("commit","-qm","test");
    const sha=git("rev-parse","HEAD");
    put("dist/index.html","<html>LAN</html>");
    put(".env.local","SECRET");
    put("pocketbase/pb_data/data.db","PRIVATE_DB");
    put("services/pg-api/server.js","do_not_ship");
    const summary=buildLanBundle(source,out,sha);
    assert.equal(summary.commit,sha);
    assert.equal(existsSync(path.join(out,"dist/index.html")),true);
    assert.equal(existsSync(path.join(out,"pocketbase/pb_data")),false);
    assert.equal(existsSync(path.join(out,".env.local")),false);
    assert.equal(existsSync(path.join(out,"services/pg-api")),false);
    const manifest=JSON.parse(readFileSync(path.join(out,"release-manifest.json"),"utf8"));
    assert.ok(manifest.files.some(f=>f.path==="worker/run.mjs"));
    assert.ok(manifest.files.some(f=>f.path==="dist/index.html"));
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("LAN packer blocks traversal, credential material, archives and any DB", () => {
  for(const p of [
    "/etc/shadow","dist/.env","worker/secrets/password","dist/api.key",
    "pocketbase/pb_data/data.db","worker/archive.tar.gz",
    "dist/../../.env","services/pg-api/server.js"
  ]) assert.equal(allowlistedReleasePath(p),false,p);
});

test("LAN outbound timer is inert until explicit operator enable", () => {
 const service=readFileSync("deploy/lan/agentstudio-lan-update.service.example","utf8");
 const timer=readFileSync("deploy/lan/agentstudio-lan-update.timer.example","utf8");
 const script=readFileSync("deploy/lan/pull-update.py","utf8");
 assert.match(service,/ExecStart=.*--auto/);
 assert.match(timer,/OnCalendar=.*15/);
 assert.match(script,/LAN_AUTO_DISABLED/);
 assert.match(script,/AUTO_FRONTEND_ONLY/);
 assert.match(script,/ci.confirmed_head\(\)/);
 assert.doesNotMatch(script,/postgres.*(?:DROP|DELETE)/i);
});
test("LAN service keeps builder HOME writeable, uses local pinned CA and never bypasses TLS",()=>{
 const unit=readFileSync("deploy/lan/agentstudio-lan-update.service.example","utf8");
 const controller=readFileSync("deploy/lan/agentstudio-lan-deploy.py","utf8");
 assert.match(unit,/ReadWritePaths=.*\/var\/lib\/agentstudio-build/);
 assert.match(unit,/ProtectSystem=strict/);
 assert.match(controller,/--cacert/);
 assert.doesNotMatch(controller,/--resolve.*127\.0\.0\.1/);
 assert.doesNotMatch(controller,/["']-k["']/);
});

test("active symlink and release directories require root-only mutation rights",()=>{
 const pull=readFileSync("deploy/lan/pull-update.py","utf8");
 const activator=readFileSync("deploy/lan/agentstudio-lan-deploy.py","utf8");
 assert.match(pull,/release_root_must_be_root_owned/);
 assert.match(pull,/root_owned_release_dirs_required/);
 assert.match(pull,/operator_script_not_root_owned/);
 assert.match(activator,/lan_release_root_not_operator_owned/);
 assert.match(activator,/lan_directory_missing_or_symlink/);
});

test("quality CI provisions verified PocketBase before the standalone unit suite",()=>{
 const workflow=readFileSync(".github/workflows/agent-studio-quality.yml","utf8");
 const install=workflow.indexOf("Install PocketBase 0.40.5 for integration and unit tests");
 const unit=workflow.indexOf("Unit regression and TypeScript production build");
 assert.ok(install>0 && unit>install,"PocketBase must be provisioned before unit tests");
 assert.match(workflow,/sha256sum --check/);
});
test("isolated PostgreSQL 17 test fixture supplies the current required identity mapping SHA",()=>{
 const src=readFileSync("services/pg-api/tests/pg17-tcp.integration.mjs","utf8");
 assert.match(src,/target_schedule_id,payload_sha256,projection_sha256,identity_mapping_sha256,source_record/);
});

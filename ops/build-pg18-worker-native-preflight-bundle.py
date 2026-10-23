#!/usr/bin/env python3
"""Build ONE source-only PG18 Prepare+Model readonly native Worker review ZIP.

Only eight audited additive files plus a README and SHA manifest. The
existing 0440/ACL credential policy remains in the original separately
audited directory. No existing SHA locked file is modified/replaced.
No secrets, model providers, actual task engine, or npm packages included.
"""
import hashlib
import json
from pathlib import Path
import stat
import sys
import zipfile

ROOT=Path(__file__).resolve().parent.parent
FILES=(
    "ops/baota-pg18-worker-native-preflight-review.py",
    "services/pg-api/src/pg18-native-worker-readonly.ts",
    "services/pg-api/src/pg18-prepare-readonly-preflight.ts",
    "services/pg-api/src/pg18-model-readonly-preflight.ts",
    "services/pg-api/src/optional-credential-boundary.ts",
    "services/pg-api/src/knowledge-content-privileges.ts",
    "services/pg-api/src/knowledge-embedding-privileges.ts",
    "services/pg-api/src/knowledge-sharing-policy.ts",
)
README="README_PG18_NATIVE_WORKER_PREFLIGHT.txt"
MANIFEST="SHA256SUMS_NATIVE_WORKER_PREFLIGHT"
ZIPNAME="pg18_native_worker_preflight.zip"

INSTRUCTIONS="""Agent Studio PG18 — Prepare and Model REAL READONLY PREFLIGHT entrypoints.

Previous BaoTa milestone (confirmed by operator): independent ACL-aware
Prepare stage probe passed stage_code=complete, stage_status=passed,
prepare_readonly_verified=true, systemd_run_exit_code=0. The old PocketBase
and PocketBase Worker remain active. This did NOT start the actual PG18
Prepare/Model Worker task loops or invoke any model provider.

This ZIP adds EIGHT source files:
  ops/baota-pg18-worker-native-preflight-review.py
  services/pg-api/src/pg18-native-worker-readonly.ts
  services/pg-api/src/pg18-prepare-readonly-preflight.ts
  services/pg-api/src/pg18-model-readonly-preflight.ts
  services/pg-api/src/optional-credential-boundary.ts
  services/pg-api/src/knowledge-content-privileges.ts
  services/pg-api/src/knowledge-embedding-privileges.ts
  services/pg-api/src/knowledge-sharing-policy.ts
plus this README and SHA256SUMS_NATIVE_WORKER_PREFLIGHT.

The same pg18-native-worker-readonly.ts is dynamically imported by the
Prepare/Model actual PG18 Worker --preflight CLI branches in the current
source tree. The ZIP exposes that exact shared implementation through
TWO preflight-only wrappers; neither can run --serve or task/model loops.
No old SHA256-pinned source, credential, database row, model engine, npm
library or service unit is in the package. Existing driver symlink and
root:root 0440 ACL-aware policy are reused.

Target is fixed to 127.0.0.1:5333/agent_studio, login fixed to
agentstudio_stage_worker. Both systemd oneshots use DynamicUser=yes,
LoadCredential=worker.secret and each unit's own absolute path:
  /run/credentials/agentstudio-pg18-prepare.service/worker.secret
  /run/credentials/agentstudio-pg18-model.service/worker.secret
Network remains loopback-only. Each uses SELECT, read-only role checks
and closes its PG pool. NO tasks or model calls occur. The Model
preflight never imports model-provider.ts / model-worker.ts.

Upload into the EXISTING verified audit directory:
  /opt/agentstudio-pg18-worker-preflight-v1
Independently check the OUTER ZIP SHA256 supplied alongside this download.
Then run:
  cd /opt/agentstudio-pg18-worker-preflight-v1 || exit 1
  unzip -n pg18_native_worker_preflight.zip
  sha256sum -c SHA256SUMS_NATIVE_WORKER_PREFLIGHT
  python3 ops/baota-pg18-worker-native-preflight-review.py --plan

--plan checks ALL old/new manifests, source ownership, dynamic user,
credential path, database target, strict security flags and both unit names.
It never starts systemd, opens the DB, reads secrets or modifies PB.

ONLY IF --plan reports ready_for_two_readonly_preflights=true AND an
authorized operator explicitly approves TWO sequential transient non-root
READONLY preflight processes, run ONCE:
  python3 ops/baota-pg18-worker-native-preflight-review.py --preflight-both --approve-two-readonly-oneshots

Prepare is checked FIRST. Model is started only if Prepare returned
complete verified readonly evidence. Any failure stops immediately,
returning a sanitized stage and numeric exit code. Never share raw
stderr, passwords, private key, model key or original service journal.

Expected success: both_readonly_verified=true, and both
prepare_readonly_verified=true and model_readonly_verified=true.
At no point is --serve invoked or a task claimed. This is a preflight
of the actual Workers' shared PG18 readonly code, not a full Worker loop
integration test. Completing this still DOES NOT authorize production
switch: NO-GO. Existing PocketBase must remain active.

After real two-Worker preflight passes, the next milestone is an
isolated, backed-up disposable PG18 job-lifecycle UAT: Agent claims,
approval, idempotency, retries, recovery, model cost controls, Workflow
and knowledge-base ACL, followed by formal GO/NO-GO and rollback.
"""

def stop(message):
    raise SystemExit("PG18_NATIVE_BUNDLE_REFUSED:"+message)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def zip_info(name):
    x=zipfile.ZipInfo(name,(2026,10,20,0,0,0))
    x.create_system=3
    x.external_attr=(stat.S_IFREG|0o644)<<16
    x.compress_type=zipfile.ZIP_DEFLATED
    return x

def read_source(name):
    file=ROOT/name
    info=file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size>100000:
        stop("unsafe_source:"+name)
    return file.read_bytes()

def assert_contract(payload):
    python=payload[FILES[0]].decode("utf8")
    shared=payload[FILES[1]].decode("utf8")
    prep=payload[FILES[2]].decode("utf8")
    model=payload[FILES[3]].decode("utf8")
    boundary=payload[FILES[4]].decode("utf8")
    knowledge=payload[FILES[5]].decode("utf8")
    if ('export async function verifyKnowledgeHelperCredentials' not in knowledge or
        'has_any_column_privilege' not in knowledge or 'pg_catalog.pg_class' not in knowledge):
        stop("knowledge_credential_inspector_missing")
    if ('export async function verifyOptionalCredentialBoundary' not in boundary or
        'pg_catalog.pg_class' not in boundary or 'has_any_column_privilege' not in boundary):
        stop("optional_credential_boundary_missing")
    for marker in (
        '["--preflight-both","--approve-two-readonly-oneshots"]',
        'def checked_command(kind,reviewed):',
        'NEW_MANIFEST = "SHA256SUMS_NATIVE_WORKER_PREFLIGHT"',
        '"production_cutover_allowed":False',
    ):
        if marker not in python:
            stop("operator_contract_unexpected")
    try:compile(python,FILES[0],"exec")
    except SyntaxError:stop("operator_syntax_invalid")
    for marker in (
        'runPg18NativeWorkerReadonlyPreflight',
        'assertPg18CredentialMetadata',
        'assertPg18WorkerCredentialBinding',
        'verifyPgRuntimeTarget(adapter,target)',
        'verifyPgWorkerRoleBoundary(adapter,target)',
        'verifyOptionalCredentialBoundary(optional,"worker")',
        'external_model_calls:false',
        'db_writes_performed:false',
        'process.exitCode=3',
    ):
        if marker not in shared:
            stop("shared_readonly_contract_unexpected")
    for kind,text in (("prepare",prep),("model",model)):
        if('runPg18NativeWorkerReadonlyPreflight("'+kind+'")' not in text or
           'process.argv[2]==="--preflight"' not in text):
            stop("wrapper_contract_unexpected:"+kind)
    combined=shared+prep+model+boundary+knowledge
    for token in (
        "AgentPrepareWorker","AgentModelWorker",
        "createStagingOpenAIProvider","model-provider.ts",
        "agent-worker.ts","model-worker.ts",".tick(","claimJob",
        "INSERT INTO","UPDATE agentstudio","DELETE FROM","FOR UPDATE"
    ):
        if token in combined:
            stop("executable_task_or_model_code_detected:"+token)
    for name,kind in (("worker-loop.ts","prepare"),
                      ("model-worker-loop.ts","model")):
        real=read_source("services/pg-api/src/"+name).decode("utf8")
        if ('import("./pg18-native-worker-readonly.ts")' not in real or
            'runPg18NativeWorkerReadonlyPreflight("'+kind+'")' not in real or
            'preflight&&process.env.AGENT_STUDIO_PG_BAOTA18_ENABLED==="true"'
            not in real):
            stop("real_worker_preflight_not_shared:"+name)

def build(folder):
    output=Path(folder)
    if not output.is_absolute():
        stop("absolute_output_required")
    source_root=ROOT.resolve()
    resolved=output.resolve()
    if resolved==source_root or source_root in resolved.parents:
        stop("cannot_bundle_into_source_tree")
    payload={key:read_source(key) for key in FILES}
    assert_contract(payload)
    payload[README]=INSTRUCTIONS.encode("utf8")
    manifest="".join(digest(payload[key])+"  "+key+"\n"
                     for key in sorted(payload))
    payload[MANIFEST]=manifest.encode("ascii")
    output.mkdir(parents=True,exist_ok=True)
    file=output/ZIPNAME
    if file.exists() or file.is_symlink():
        stop("refuse_to_overwrite_existing_zip")
    try:
        with zipfile.ZipFile(file,"x") as archive:
            for key in sorted(payload):
                archive.writestr(zip_info(key),payload[key])
        with zipfile.ZipFile(file,"r") as archive:
            if set(archive.namelist())!=set(payload):
                stop("zip_members_mismatch")
            for name,raw in payload.items():
                if archive.read(name)!=raw:
                    stop("zip_payload_changed")
    except Exception:
        file.unlink(missing_ok=True)
        raise
    return {
        "archive":str(file),"sha256":digest(file.read_bytes()),
        "bytes":file.stat().st_size,"files":len(payload),
        "manifest_verified":True,"two_readonly_wrappers":True,
        "previous_sources_overwritten":False,
        "credential_bytes_included":False,
        "task_worker_included":False,"model_provider_included":False,
        "database_connected":False,"production_modified":False,
        "production_cutover_allowed":False,
    }

def main(args):
    if len(args)!=2 or args[0]!="--output-dir":
        stop("explicit_absolute_output_required")
    print(json.dumps(build(args[1]),sort_keys=True))

if __name__=="__main__":
    main(sys.argv[1:])

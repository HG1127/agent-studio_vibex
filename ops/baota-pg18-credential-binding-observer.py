#!/usr/bin/env python3
"""PG18 Worker: one metadata-only transient systemd credential binding audit.

The transient child reads ONLY process UID and variable/path METADATA. It
does not open worker.secret, connect to PostgreSQL, import model/Worker tasks,
or emit raw environment values. Does not install or modify any systemd unit.
"""
import importlib.util
import json
from pathlib import Path
import os
import stat
import subprocess
import sys

ROOT = Path("/opt/agentstudio-pg18-worker-preflight-v1")
PREVIOUS = ROOT / "ops/baota-pg18-prepare-transient-diagnostic.py"
NEW = ROOT / "ops/baota-pg18-credential-binding-observer.py"
NEW_MANIFEST = "SHA256SUMS_BINDING_OBSERVER"
SERVICE = "agentstudio-pg18-prepare.service"
EXPECTED_DIRECTORY = "/run/credentials/" + SERVICE
MARKER = "pg18_credential_metadata_v1"

# Code transported as a non-secret argument to a transient Python process.
# This script intentionally never calls open()/read_text() on the credential.
CHILD = r"""
import os,json,stat
D=os.environ.get("CREDENTIALS_DIRECTORY","")
P=os.environ.get("AGENT_STUDIO_PG_WORKER_PASSWORD_FILE","")
S="/run/credentials/agentstudio-pg18-prepare.service"
EXPECTED=S+"/worker.secret"
try:
    present=stat.S_ISREG(os.lstat(EXPECTED).st_mode)
except OSError:
    present=False
print(json.dumps({
    "marker":"pg18_credential_metadata_v1",
    "uid_nonroot":hasattr(os,"getuid") and os.getuid()!=0,
    "credential_dir_present":bool(D),
    "credential_dir_exact":D==S,
    "password_env_present":bool(P),
    "password_env_exact":P==EXPECTED,
    "password_env_matches_dir":bool(D) and P==D+"/worker.secret",
    "password_env_unexpanded_percent_d":P=="%d/worker.secret",
    "expected_credential_regular":present,
    "pg18_mode_enabled":os.environ.get("AGENT_STUDIO_PG_BAOTA18_ENABLED")=="true",
},sort_keys=True))
"""

FIELDS = (
    "uid_nonroot", "credential_dir_present", "credential_dir_exact",
    "password_env_present", "password_env_exact",
    "password_env_matches_dir", "password_env_unexpanded_percent_d",
    "expected_credential_regular", "pg18_mode_enabled",
)


def refuse(message):
    raise SystemExit("PG18_CREDENTIAL_OBSERVER_REFUSED:" + message)


def checked_file(item):
    try:
        value = item.lstat()
    except OSError:
        return False
    return (stat.S_ISREG(value.st_mode) and value.st_uid == 0 and
            not(value.st_mode & 0o022) and bool(value.st_mode & 0o004))


def verify_manifests():
    if not all(checked_file(ROOT / name) for name in (
        "SHA256SUMS", "SHA256SUMS_PREPARE_DIAG",
        "SHA256SUMS_STAGE_PROBE", NEW_MANIFEST
    )):
        refuse("manifest_metadata_untrusted")
    if not checked_file(PREVIOUS) or not checked_file(NEW):
        refuse("source_metadata_untrusted")
    for name in ("SHA256SUMS", "SHA256SUMS_PREPARE_DIAG",
                 "SHA256SUMS_STAGE_PROBE", NEW_MANIFEST):
        try:
            p = subprocess.run(["/usr/bin/sha256sum","-c",name],
                cwd=ROOT, capture_output=True,text=True,timeout=25,check=False,
                env={"PATH":"/usr/bin:/bin","LANG":"C"},
                stdin=subprocess.DEVNULL)
        except (OSError,subprocess.TimeoutExpired):
            refuse("manifest_check_unavailable")
        if p.returncode:
            refuse("manifest_check_failed:" + name)


def original():
    verify_manifests()
    spec = importlib.util.spec_from_file_location("pg18_pinned_prepare_diagnostic",PREVIOUS)
    if not spec or not spec.loader:
        refuse("previous_diagnostic_unavailable")
    module = importlib.util.module_from_spec(spec)
    prior=sys.dont_write_bytecode
    sys.dont_write_bytecode=True
    try:
        spec.loader.exec_module(module)
        prior_operator=module.load_operator()
    finally:
        sys.dont_write_bytecode=prior
    return module,prior_operator


def safe_command(diag,op):
    args=diag.guarded_argv(op)
    if (args[:6] != ["/usr/bin/systemd-run","--system","--wait",
                     "--collect","--pipe","--unit="+SERVICE] or
        args[-4:] != [str(op.NODE),"--experimental-strip-types",
                      str(ROOT / "services/pg-api/src/worker-loop.ts"),
                      "--preflight"] or
        not any(value=="--property=DynamicUser=yes" for value in args) or
        not any(value=="--property=LoadCredential=worker.secret:"+str(op.SECRET)
                for value in args) or
        not any(value.startswith("--property=Environment=") and
                "AGENT_STUDIO_PG_WORKER_PASSWORD_FILE=%d/worker.secret" in value
                for value in args)):
        refuse("original_transient_argv_unexpected")
    result=args[:-4]+["/usr/bin/python3","-c",CHILD]
    if any("--serve"==v or "model-worker-loop" in v for v in result):
        refuse("unsafe_execution_target")
    return result


def precheck(diag,op):
    check,_=diag.readiness(op)
    if (check.get("original_plan_ready") is not True or
        check.get("argv_verified") is not True or
        check.get("audited_driver_link_exact") is not True):
        refuse("previous_readiness_missing")
    command=safe_command(diag,op)
    return {
        "mode":"pg18_binding_metadata_plan",
        "original_checks_verified":True,
        "prepare_only":True,
        "would_start_metadata_only_transient":False,
        "credentials_read":False,
        "database_connected":False,
        "task_worker_started":False,
        "model_worker_started":False,
        "production_cutover_allowed":False
    },command


def parse_metadata(stdout):
    accepted=[]
    for line in stdout.splitlines():
        if len(line)>4000: continue
        try:
            obj=json.loads(line)
        except ValueError: continue
        if not isinstance(obj,dict) or obj.get("marker")!=MARKER:
            continue
        if set(obj) != {"marker",*FIELDS}:
            continue
        if all(type(obj[field]) is bool for field in FIELDS):
            accepted.append({field:obj[field] for field in FIELDS})
    return accepted[0] if len(accepted)==1 else None


def diagnose(diag,op):
    _,args=precheck(diag,op)
    try:
        run=subprocess.run(args,cwd=ROOT, capture_output=True,text=True,
                           timeout=50, check=False,stdin=subprocess.DEVNULL,
                           env={"PATH":"/usr/bin:/bin","HOME":"/tmp","LANG":"C"})
        status=run.returncode
        output=parse_metadata(run.stdout or "")
        codes=[] if output is not None else diag.classify(run.stdout or "",
                                                           run.stderr or "")
    except (OSError,subprocess.TimeoutExpired):
        status=None
        output=None
        codes=["TRANSIENT_METADATA_PROBE_UNAVAILABLE"]
    if not op.old_services_active():
        codes.append("ORIGINAL_POCKETBASE_NOT_ACTIVE")
    return {
        "mode":"pg18_binding_metadata_observation",
        "systemd_run_exit_code":status,
        "context_flags":output,
        "diagnostic_codes":sorted(set(codes)),
        "metadata_captured":output is not None,
        "raw_environment_disclosed":False,
        "credential_bytes_read":False,
        "database_connected":False,
        "task_worker_started":False,
        "model_worker_started":False,
        "production_cutover_allowed":False
    }


def main(argv):
    if argv not in (["--plan"],["--observe-once","--approve-metadata-only"]):
        refuse("explicit_mode_required")
    diag,op=original()
    if argv==["--plan"]:
        result,_=precheck(diag,op)
    else:
        result=diagnose(diag,op)
    print(json.dumps(result,sort_keys=True))
    if argv[0]!="--plan" and not result["metadata_captured"]:
        raise SystemExit(3)


if __name__=="__main__":
    main(sys.argv[1:])

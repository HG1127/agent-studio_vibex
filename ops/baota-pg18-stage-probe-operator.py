#!/usr/bin/env python3
"""One controlled, stage-coded PG18 PREPARE readonly probe through systemd.

Never edits the original audit program/manifest, starts model/task Workers,
prints credentials, or sends arbitrary queries. --plan does not open the DB.
"""
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

ROOT = Path("/opt/agentstudio-pg18-worker-preflight-v1")
OLD_DIAGNOSTIC = ROOT / "ops/baota-pg18-prepare-transient-diagnostic.py"
PROBE = ROOT / "services/pg-api/src/pg18-prepare-stage-probe.ts"
NEW_OPERATOR = ROOT / "ops/baota-pg18-stage-probe-operator.py"
NEW_MANIFEST = "SHA256SUMS_STAGE_PROBE"
OLD_MANIFESTS = ("SHA256SUMS", "SHA256SUMS_PREPARE_DIAG")
MARKER = "pg18_prepare_stage_probe_v1"
STAGES = frozenset((
    "credential_binding", "runtime_target_config", "secret_file",
    "pg_module", "pg_tcp_connection", "pg_server_identity",
    "worker_role_boundary", "pool_cleanup", "complete",
))


def refuse(code):
    raise SystemExit("PG18_PREPARE_STAGE_REFUSED:" + code)


def source_safe(file):
    try:
        x = file.lstat()
        return (stat.S_ISREG(x.st_mode) and x.st_uid == 0 and
                (x.st_mode & 0o022) == 0 and (x.st_mode & 0o004) != 0)
    except OSError:
        return False


def verify_checksums():
    if not all(source_safe(x) for x in (PROBE, NEW_OPERATOR,
                                        ROOT / "SHA256SUMS",
                                        ROOT / "SHA256SUMS_PREPARE_DIAG",
                                        ROOT / NEW_MANIFEST, OLD_DIAGNOSTIC)):
        refuse("audit_source_metadata_unsafe")
    for filename in (*OLD_MANIFESTS, NEW_MANIFEST):
        try:
            done = subprocess.run(["/usr/bin/sha256sum", "-c", filename],
                                  cwd=ROOT, capture_output=True, text=True,
                                  timeout=25, check=False,
                                  env={"PATH": "/usr/bin:/bin", "LANG": "C"},
                                  stdin=subprocess.DEVNULL)
        except (OSError, subprocess.TimeoutExpired):
            refuse("checksum_runner_unavailable")
        if done.returncode != 0:
            refuse("checksum_mismatch:" + filename)


def load_previous():
    verify_checksums()
    spec = importlib.util.spec_from_file_location("pg18_pinned_prev_diagnostic",
                                                   OLD_DIAGNOSTIC)
    if not spec or not spec.loader:
        refuse("prior_diagnostic_unavailable")
    diag = importlib.util.module_from_spec(spec)
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(diag)
        operator = diag.load_operator()
    except Exception:
        refuse("original_operator_load_failed")
    finally:
        sys.dont_write_bytecode = previous
    return diag, operator


def approved_argv(diag,operator):
    # Start with the SAME existing approved systemd settings: DynamicUser,
    # LoadCredential, one-shot, loopback-only, and matching unit credentials.
    original = diag.guarded_argv(operator)
    if original[-1] != "--preflight" or len(original) < 15 or \
       original[-2] != str(ROOT / "services/pg-api/src/worker-loop.ts"):
        refuse("existing_preflight_argv_unexpected")
    argv = original.copy()
    argv[-2] = str(PROBE)
    if any("--serve" == x or "model-worker-loop.ts" in x for x in argv):
        refuse("unsafe_probe_command")
    if argv[-4:] != [
        str(operator.NODE),"--experimental-strip-types",str(PROBE),"--preflight"
    ]:
        refuse("probe_entrypoint_changed")
    return argv


def plan(diag,operator):
    original, _ = diag.readiness(operator)
    if original.get("argv_verified") is not True or \
       original.get("original_plan_ready") is not True:
        refuse("original_plan_not_ready")
    argv = approved_argv(diag,operator)
    return {
        "mode": "pg18_prepare_stage_probe_plan",
        "ready_for_stage_probe": True,
        "all_three_manifests_verified": True,
        "original_preflight_guarded": True,
        "only_prepare_nonroot_readonly": True,
        "new_readonly_entrypoint_checked": True,
        "will_start_transient_service": False,
        "database_connected": False,
        "secrets_read": False,
        "task_worker_started": False,
        "model_worker_started": False,
        "production_cutover_allowed": False,
    },argv


def parse_stage(stdout):
    results=[]
    for line in stdout.splitlines():
        if len(line)>4096:
            continue
        try:
            value=json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(value,dict) or value.get("diagnostic_marker")!=MARKER:
            continue
        step=value.get("stage")
        status=value.get("status")
        if (step not in STAGES or status not in ("passed","failed") or
                value.get("readonly_preflight") is not True or
                value.get("database_writes_performed") is not False or
                value.get("task_worker_started") is not False or
                value.get("model_worker_started") is not False or
                value.get("external_model_calls") is not False or
                value.get("production_cutover_allowed") is not False):
            continue
        results.append((status,step))
    return results[0] if len(results)==1 else None


def once(diag,operator):
    info,argv=plan(diag,operator)
    try:
        outcome=subprocess.run(
            argv,cwd=ROOT,capture_output=True,text=True,timeout=65,
            check=False,stdin=subprocess.DEVNULL,
            env={"PATH":"/usr/bin:/bin","HOME":"/tmp","LANG":"C"})
        exit_code=outcome.returncode
        stdout=outcome.stdout or ""
        stderr=outcome.stderr or ""
        result=parse_stage(stdout)
        flags=[] if result is not None else diag.classify(stdout,stderr)
    except (OSError,subprocess.TimeoutExpired):
        exit_code=None
        stdout=""
        stderr=""
        result=None
        flags=["SYSTEMD_RUN_UNAVAILABLE_OR_TIMED_OUT"]
    if not operator.old_services_active():
        flags.append("ORIGINAL_POCKETBASE_NOT_ACTIVE")
    verified=exit_code==0 and result==("passed","complete") and not flags
    return {
        "mode": "pg18_prepare_stage_probe_result",
        "systemd_run_exit_code": exit_code,
        "stage_code": (result[1] if result else "no_stage_json"),
        "stage_status": (result[0] if result else "unavailable"),
        "readonly_prepare_stage_verified": verified,
        "runner_diagnostic_codes": sorted(set(flags)),
        "stdout_lines_observed": len(stdout.splitlines()),
        "stderr_lines_observed": len(stderr.splitlines()),
        "raw_output_disclosed": False,
        "database_writes_intended": False,
        "task_worker_started": False,
        "model_worker_started": False,
        "production_cutover_allowed": False,
    }


def main(argv):
    if argv not in (["--plan"],
                    ["--probe-once","--approve-readonly-stage-probe"]):
        refuse("explicit_mode_required")
    diag,operator=load_previous()
    if argv==["--plan"]:
        result,_=plan(diag,operator)
    else:
        result=once(diag,operator)
    print(json.dumps(result,sort_keys=True))
    if argv[0]!="--plan" and not result["readonly_prepare_stage_verified"]:
        raise SystemExit(3)


if __name__=="__main__":
    main(sys.argv[1:])

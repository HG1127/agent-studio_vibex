#!/usr/bin/env python3
"""One-use diagnostic for a failed PG18 PREPARE --preflight transient unit.

No passwords/log lines are printed. --plan is offline. --diagnose-once is
explicit opt-in and retries exactly one existing, SHA-verified, read-only
PREPARE systemd-run command. It never invokes --serve or Model Worker.
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ROOT = Path("/opt/agentstudio-pg18-worker-preflight-v1")
OPERATOR = ROOT / "ops/baota-pg18-nonroot-worker-preflight.py"
EXACT_UNIT = "agentstudio-pg18-prepare.service"

# Matching is ONLY used to return these fixed enums, never raw log contents.
SIGNATURES = (
    ("SYSTEMD_BUS_UNAVAILABLE", r"Failed to connect to bus|Connection to .* bus"),
    ("SYSTEMD_PROPERTY_REJECTED", r"Failed to set properties|Failed to set property|Unknown (?:assignment|property)|Unknown (?:lvalue|key)|Invalid (?:argument|property|unit file setting)|bad unit file setting"),
    ("SYSTEMD_TRANSIENT_CREATE_FAILED", r"Failed to (?:start|create) transient (?:service|scope|unit)|Failed to start .*service unit"),
    ("SYSTEMD_OPTION_UNSUPPORTED", r"unrecognized option|unknown option|Failed to parse command line"),
    ("SYSTEMD_UNIT_CONFLICT", r"already exists|Unit .* already (?:loaded|exists)|Unit .* is masked"),
    ("SYSTEMD_USER_FAILURE", r"217/USER|Failed at step USER|Failed to determine user credentials"),
    ("SYSTEMD_GROUP_FAILURE", r"216/GROUP|Failed at step GROUP"),
    ("SYSTEMD_EXEC_FAILURE", r"203/EXEC|Failed at step EXEC"),
    ("SYSTEMD_WORKDIR_FAILURE", r"200/CHDIR|Failed at step CHDIR"),
    ("SYSTEMD_NAMESPACE_FAILURE", r"226/NAMESPACE|Failed at step NAMESPACE"),
    ("SYSTEMD_CREDENTIAL_FAILURE", r"243/CREDENTIALS|Failed to set up credentials|Failed to load credentials|LoadCredential.*(?:failed|error)"),
    ("SYSTEMD_PERMISSION_FAILURE", r"Permission denied|EACCES|Access denied"),
    ("NODE_MODULE_LOAD_FAILURE", r"ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find (?:module|package)|ERR_UNKNOWN_FILE_EXTENSION"),
    ("NODE_PERMISSION_FAILURE", r"ERR_ACCESS_DENIED|ERR_PERMISSION_DENIED"),
    ("WORKER_CREDENTIAL_BINDING", r"pg18_worker_credential_binding_required"),
    ("WORKER_SECRET_UNSAFE", r"unsafe_worker_secret(?:_file)?"),
    ("WORKER_RUNTIME_TARGET", r"pg_runtime_target_mismatch|unsafe_pg_runtime_target"),
    ("WORKER_DATABASE_ROLE", r"unsafe_pg_worker_role_boundary|worker_permission_missing"),
    ("WORKER_CONNECTION_ERROR", r"ECONNREFUSED|ETIMEDOUT|connection refused|password authentication failed|28P01|ENETUNREACH"),
    ("WORKER_DISABLED", r"worker_disabled"),
    ("WORKER_GENERIC_FAILURE", r"worker_start_failed"),
)


def abort(reason):
    raise SystemExit("PG18_PREPARE_DIAGNOSTIC_REFUSED:" + reason)


def classify(stdout, stderr):
    joined = (stdout + "\n" + stderr)[:90000]
    found = [name for name, pattern in SIGNATURES
             if re.search(pattern, joined, re.IGNORECASE)]
    return found or ["UNCLASSIFIED_FAILURE"]


def parse_preflight(stdout):
    matched = []
    for line in stdout.splitlines():
        if len(line) > 4096:
            continue
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if isinstance(item, dict):
            if (item.get("mode") == "preflight" and
                    item.get("worker") == "prepare" and
                    item.get("target") == "agent_studio" and
                    item.get("database_port") == 5333 and
                    item.get("verified_roles") is True and
                    item.get("db_writes_performed") is False and
                    item.get("external_model_calls") is False and
                    item.get("worker_started") is False and
                    item.get("production_cutover_allowed") is False):
                matched.append(item)
    return len(matched) == 1


def load_operator():
    if not ROOT.is_dir():
        abort("audit_folder_missing")
    for folder in (ROOT, ROOT / "ops"):
        value = folder.lstat()
        if not stat.S_ISDIR(value.st_mode) or value.st_uid != 0 or value.st_mode & 0o022:
            abort("source_directory_unsafe")
    info = OPERATOR.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        abort("operator_file_unsafe")
    # Only the source SHA-256 verified by original manifest is imported.
    manifest = subprocess.run(["/usr/bin/sha256sum", "-c", "SHA256SUMS"],
                              cwd=ROOT, capture_output=True, text=True,
                              timeout=20, check=False,
                              env={"PATH": "/usr/bin:/bin", "LANG": "C"},
                              stdin=subprocess.DEVNULL)
    if manifest.returncode != 0:
        abort("original_source_manifest_mismatch")
    spec = importlib.util.spec_from_file_location("pg18_existing_worker_operator",
                                                   OPERATOR)
    if spec is None or spec.loader is None:
        abort("operator_import_unavailable")
    module = importlib.util.module_from_spec(spec)
    # Importing the pinned operator must not create __pycache__ in the
    # audited source tree: a --plan should remain read-only on disk.
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


def guarded_argv(op):
    args = op.transient_args("prepare")
    if (args[:6] != ["/usr/bin/systemd-run", "--system", "--wait",
                     "--collect", "--pipe", "--unit=" + EXACT_UNIT] or
            args[-4:] != [str(op.NODE), "--experimental-strip-types",
                          str(ROOT / "services/pg-api/src/worker-loop.ts"),
                          "--preflight"] or
            any(v == "--serve" or "model-worker-loop.ts" in v for v in args) or
            not any(a == "--property=DynamicUser=yes" for a in args) or
            not any(a == "--property=LoadCredential=worker.secret:" +
                    str(op.SECRET) for a in args) or
            not any(a.startswith("--property=Environment=") and
                    "AGENT_STUDIO_PG_DATABASE=agent_studio" in a and
                    "AGENT_STUDIO_PG_HOST=127.0.0.1" in a for a in args)):
        abort("transient_command_unexpected")
    return args


def readiness(op):
    info = op.plan()
    if info.get("ready_for_nonroot_preflight") is not True:
        abort("original_plan_not_ready")
    if op.link_state() != "exact":
        abort("audited_driver_link_not_ready")
    if not op.unit_is_clear("agentstudio-pg18-prepare"):
        abort("prepare_unit_not_free")
    args = guarded_argv(op)
    return {"mode": "prepare_diagnostic_plan",
            "original_plan_ready": True,
            "original_source_manifest_verified": True,
            "audited_driver_link_exact": True,
            "original_pocketbase_active": True,
            "only_prepare_preflight": True,
            "argv_verified": True,
            "will_start_transient_unit": False,
            "secret_contents_read": False,
            "production_cutover_allowed": False}, args


def diagnose_once(op):
    plan, args = readiness(op)
    try:
        outcome = subprocess.run(
            args, cwd=ROOT, capture_output=True, text=True, timeout=65,
            check=False, stdin=subprocess.DEVNULL,
            env={"PATH": "/usr/bin:/bin", "HOME": "/tmp", "LANG": "C"})
        status = outcome.returncode
        stdout = outcome.stdout or ""
        stderr = outcome.stderr or ""
        reasons = [] if status == 0 and parse_preflight(stdout) else classify(stdout, stderr)
    except (OSError, subprocess.TimeoutExpired):
        status = None
        stdout, stderr = "", ""
        reasons = ["SYSTEMD_RUN_UNAVAILABLE_OR_TIMED_OUT"]
    if not op.old_services_active():
        reasons.append("ORIGINAL_POCKETBASE_SERVICE_NOT_ACTIVE")
    success = (status == 0 and parse_preflight(stdout) and not reasons)
    return {
        "mode": "prepare_transient_diagnostic",
        "systemd_run_exit_code": status,
        "prepare_preflight_passed": success,
        "diagnostic_codes": sorted(set(reasons)),
        "stdout_lines_observed": len(stdout.splitlines()),
        "stderr_lines_observed": len(stderr.splitlines()),
        "raw_output_disclosed": False,
        "model_worker_started": False,
        "agent_task_worker_started": False,
        "database_writes_intended": False,
        "production_cutover_allowed": False,
    }


def main(argv):
    if argv not in (["--plan"], ["--diagnose-once", "--approve-readonly-retry"]):
        abort("explicit_mode_required")
    op = load_operator()
    if argv == ["--plan"]:
        result, _ = readiness(op)
        print(json.dumps(result, sort_keys=True))
    else:
        result = diagnose_once(op)
        print(json.dumps(result, sort_keys=True))
        if not result["prepare_preflight_passed"]:
            raise SystemExit(3)


if __name__ == "__main__":
    main(sys.argv[1:])

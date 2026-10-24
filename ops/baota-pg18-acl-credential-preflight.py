#!/usr/bin/env python3
"""PG18 non-root PREPARE Worker ACL-aware credential read-only probe.

Adds a NEW SHA256 audited stage probe and credential policy to the existing
source-only audit directory, without overwriting any previous SHA locked file.
--plan: no DB connection, secret access, transient systemd process or writes.
--probe-once --approve-acl-readonly-prepare: a single transient nonroot
Prepare-only STAGE probe, which reads the private credential to perform
metadata SELECT and BEGIN READ ONLY role checks. Never launches task or model
Workers, --serve, migration, or persistent systemd service.
"""
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys

ROOT = Path("/opt/agentstudio-pg18-worker-preflight-v1")
NEW_SOURCE = ROOT / "ops/baota-pg18-acl-credential-preflight.py"
NEW_PROBE = ROOT / "services/pg-api/src/pg18-prepare-acl-stage-probe.ts"
NEW_POLICY = ROOT / "services/pg-api/src/worker-credential-policy.ts"
MANIFEST = "SHA256SUMS_ACL_CREDENTIAL_PROBE"
FIXED = ROOT / "ops/baota-pg18-fixed-credential-preflight.py"
PROBE_NAME = "pg18_prepare_stage_probe_v1"


def refuse(reason):
    raise SystemExit("PG18_ACL_CREDENTIAL_PROBE_REFUSED:" + reason)


def trusted_file(path):
    try:
        info = path.lstat()
    except OSError:
        return False
    return (stat.S_ISREG(info.st_mode) and info.st_uid == 0
            and (info.st_mode & 0o022) == 0
            and (info.st_mode & 0o004) != 0)


def audit_new_sources():
    if not all(trusted_file(path) for path in (
            NEW_SOURCE, NEW_PROBE, NEW_POLICY, ROOT / MANIFEST)):
        refuse("new_source_metadata_unsafe")
    try:
        result = subprocess.run(
            ["/usr/bin/sha256sum", "-c", MANIFEST],
            cwd=ROOT, capture_output=True, text=True,
            timeout=25, check=False, stdin=subprocess.DEVNULL,
            env={"PATH": "/usr/bin:/bin", "LANG": "C"})
    except (OSError, subprocess.TimeoutExpired):
        refuse("new_source_manifest_unavailable")
    if result.returncode:
        refuse("new_source_hash_mismatch")


def load_reviewed_operator():
    audit_new_sources()
    if not trusted_file(FIXED):
        refuse("fixed_operator_untrusted")
    spec = importlib.util.spec_from_file_location("pg18_reviewed_fixed_cred", FIXED)
    if spec is None or spec.loader is None:
        refuse("fixed_operator_unavailable")
    module = importlib.util.module_from_spec(spec)
    prior = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
        stage, diag, original = module.verified_sources()
    except Exception:
        refuse("original_operator_load_failed")
    finally:
        sys.dont_write_bytecode = prior
    return module, stage, diag, original


def acl_probe_command(fixed, stage, diag, original):
    existing, args = fixed.plan(stage, diag, original)
    if not all(existing.get(x) is True for x in (
            "prepare_absolute_credential_path",
            "nonroot_and_sandbox_properties_preserved",
            "target_pg18_localhost",
            "only_prepare_stage_probe",
            "old_manifests_unchanged",
            "model_absolute_credential_path_offline_only")):
        refuse("previous_plan_incomplete")
    environment_flags = [entry for entry in args
                         if entry.startswith("--property=Environment=")]
    if len(environment_flags) != 1:
        refuse("environment_property_not_unique")
    assignments = environment_flags[0][len("--property=Environment="):].split()
    required_values = (
        "AGENT_STUDIO_PG_WORKER_PASSWORD_FILE="
        "/run/credentials/agentstudio-pg18-prepare.service/worker.secret",
        "AGENT_STUDIO_PG_HOST=127.0.0.1",
        "AGENT_STUDIO_PG_PORT=5333",
        "AGENT_STUDIO_PG_DATABASE=agent_studio",
        "AGENT_STUDIO_PG_WORKER_USER=agentstudio_stage_worker",
        "AGENT_STUDIO_PG_BAOTA18_ENABLED=true",
        "AGENT_STUDIO_PG_PILOT_ENABLED=true",
        "AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED=true",
        "AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED=true",
    )
    if any(assignments.count(value) != 1 for value in required_values) or \
       len(assignments) != len(required_values):
        refuse("pg18_environment_contract_changed")
    if (args[-4:] != [str(original.NODE), "--experimental-strip-types",
                       str(stage.PROBE), "--preflight"] or
            "--unit=agentstudio-pg18-prepare.service" not in args or
            "--property=DynamicUser=yes" not in args or
            "--property=Type=oneshot" not in args or
            "--property=LoadCredential=worker.secret:" +
            str(original.SECRET) not in args or
            "--property=IPAddressDeny=any" not in args or
            "--property=IPAddressAllow=127.0.0.0/8" not in args or
            "AGENT_STUDIO_PG_WORKER_PASSWORD_FILE=" +
            "/run/credentials/agentstudio-pg18-prepare.service/worker.secret"
            not in " ".join(args)):
        refuse("previous_systemd_contract_changed")
    updated = list(args)
    updated[-2] = str(NEW_PROBE)
    if (len(updated) != len(args) or
            sum(a != b for a, b in zip(args, updated)) != 1 or
            "--serve" in updated or
            "model-worker-loop.ts" in " ".join(updated)):
        refuse("new_entrypoint_not_isolated")
    return existing, updated


def plan(fixed, stage, diag, original):
    _, command = acl_probe_command(fixed, stage, diag, original)
    return {
        "mode": "pg18_acl_credential_readonly_plan",
        "ready_for_acl_readonly_probe": True,
        "old_source_manifests_verified": True,
        "new_source_manifest_verified": True,
        "fixed_credential_absolute_path": True,
        "root_owned_0440_acl_policy_narrow": True,
        "only_prepare_nonroot": True,
        "model_credential_contract_offline_only": True,
        "transient_service_started": False,
        "password_bytes_read": False,
        "database_connected": False,
        "db_writes_performed": False,
        "task_worker_started": False,
        "model_worker_started": False,
        "production_cutover_allowed": False,
    }, command


def execute_once(fixed, stage, diag, original):
    _, command = plan(fixed, stage, diag, original)
    try:
        outcome = subprocess.run(
            command, cwd=ROOT, capture_output=True, text=True,
            timeout=65, check=False, stdin=subprocess.DEVNULL,
            env={"PATH": "/usr/bin:/bin", "LANG": "C", "HOME": "/tmp"})
        exit_code = outcome.returncode
        stdout = outcome.stdout or ""
        stderr = outcome.stderr or ""
        result = stage.parse_stage(stdout)
        diagnosis = [] if result is not None else diag.classify(stdout, stderr)
    except (OSError, subprocess.TimeoutExpired):
        exit_code, result = None, None
        diagnosis = ["SYSTEMD_RUN_UNAVAILABLE_OR_TIMED_OUT"]
    if not original.old_services_active():
        diagnosis.append("ORIGINAL_POCKETBASE_NOT_ACTIVE")
    passed = (exit_code == 0 and result == ("passed", "complete")
              and not diagnosis)
    return {
        "mode": "pg18_acl_credential_readonly_result",
        "systemd_run_exit_code": exit_code,
        "stage_code": result[1] if result else "no_stage_json",
        "stage_status": result[0] if result else "unavailable",
        "prepare_readonly_verified": passed,
        "diagnostic_codes": sorted(set(diagnosis)),
        "raw_output_disclosed": False,
        "db_writes_intended": False,
        "task_worker_started": False,
        "model_worker_started": False,
        "production_cutover_allowed": False,
    }


def main(args):
    if args not in (["--plan"],
                    ["--probe-once", "--approve-acl-readonly-prepare"]):
        refuse("explicit_mode_required")
    fixed, stage, diag, original = load_reviewed_operator()
    if args == ["--plan"]:
        result, _ = plan(fixed, stage, diag, original)
    else:
        result = execute_once(fixed, stage, diag, original)
    print(json.dumps(result, sort_keys=True))
    if args != ["--plan"] and not result["prepare_readonly_verified"]:
        raise SystemExit(3)


if __name__ == "__main__":
    main(sys.argv[1:])

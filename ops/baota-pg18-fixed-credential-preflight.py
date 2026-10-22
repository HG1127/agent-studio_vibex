#!/usr/bin/env python3
"""PG18 transient systemd credential path hotfix, without changing old bundles.

The original audited transient Environment property carried %d/worker.secret
unexpanded on the real BaoTa host. Substitute ONLY that exact variable with
/run/credentials/<fixed-unit>/worker.secret, preserving all other properties.

--plan: offline read-only check of previous manifests and systemd argv.
--probe-once --approve-readonly-credential-fix: exactly one transient,
  nonroot Prepare STAGE probe; SELECT/READ ONLY role checks only.

NO Worker tick loop, model provider, --serve, database writes, password print,
persistent systemd install, or changes to the original operator.
"""
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys

ROOT = Path("/opt/agentstudio-pg18-worker-preflight-v1")
THIS = ROOT / "ops/baota-pg18-fixed-credential-preflight.py"
MANIFEST = "SHA256SUMS_CREDENTIAL_FIX"
STAGE_SOURCE = ROOT / "ops/baota-pg18-stage-probe-operator.py"
BINDING_MANIFEST = "SHA256SUMS_BINDING_OBSERVER"
UNITS = {
    "prepare": "agentstudio-pg18-prepare.service",
    "model": "agentstudio-pg18-model.service",
}
ENV_KEY = "AGENT_STUDIO_PG_WORKER_PASSWORD_FILE"
OLD_VALUE = ENV_KEY + "=%d/worker.secret"
RUN = "/usr/bin/systemd-run"


def refuse(code):
    raise SystemExit("PG18_CREDENTIAL_FIX_REFUSED:" + code)


def safe_file(file):
    try:
        item = file.lstat()
        return (stat.S_ISREG(item.st_mode) and item.st_uid == 0 and
                not item.st_mode & 0o022 and bool(item.st_mode & 0o004))
    except OSError:
        return False


def verify_extra_manifests():
    for file in (THIS, ROOT / MANIFEST,
                 ROOT / BINDING_MANIFEST,
                 ROOT / "ops/baota-pg18-credential-binding-observer.py"):
        if not safe_file(file):
            refuse("extra_source_metadata_unsafe")
    for name in (BINDING_MANIFEST, MANIFEST):
        try:
            check = subprocess.run(
                ["/usr/bin/sha256sum", "-c", name],
                cwd=ROOT, capture_output=True, text=True,
                timeout=25, check=False, stdin=subprocess.DEVNULL,
                env={"PATH": "/usr/bin:/bin", "LANG": "C"})
        except (OSError, subprocess.TimeoutExpired):
            refuse("manifest_check_unavailable")
        if check.returncode != 0:
            refuse("manifest_mismatch:" + name)


def verified_sources():
    verify_extra_manifests()
    if not safe_file(STAGE_SOURCE):
        refuse("stage_probe_source_untrusted")
    spec = importlib.util.spec_from_file_location(
        "verified_pg18_prepare_stage", STAGE_SOURCE)
    if spec is None or spec.loader is None:
        refuse("stage_probe_source_unavailable")
    stage = importlib.util.module_from_spec(spec)
    prior = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(stage)
        diag, operator = stage.load_previous()
    except Exception:
        refuse("previous_operator_unavailable")
    finally:
        sys.dont_write_bytecode = prior
    return stage, diag, operator


def fixed_argv(original, kind, operator):
    """Fail closed: exactly one Environment property value may differ."""
    if kind not in UNITS:
        refuse("kind_not_allowed")
    unit = UNITS[kind]
    if (original[:6] != [RUN, "--system", "--wait", "--collect",
                          "--pipe", "--unit=" + unit] or
            not all(flag in original for flag in (
                "--property=DynamicUser=yes",
                "--property=Type=oneshot",
                "--property=User=" + unit.removesuffix(".service"),
                "--property=LoadCredential=worker.secret:" + str(operator.SECRET),
                "--property=NoNewPrivileges=yes",
                "--property=ProtectHome=yes",
                "--property=IPAddressDeny=any",
                "--property=IPAddressAllow=127.0.0.0/8",
            )) or
            original[-1] != "--preflight" or
            any(x == "--serve" for x in original)):
        refuse("source_systemd_properties_unexpected")
    indices = [i for i, value in enumerate(original)
               if value.startswith("--property=Environment=")]
    if len(indices) != 1:
        refuse("environment_property_not_unique")
    index = indices[0]
    props = original[index][len("--property=Environment="):].split(" ")
    matches = [i for i, value in enumerate(props)
               if value.startswith(ENV_KEY + "=")]
    if len(matches) != 1 or props[matches[0]] != OLD_VALUE:
        refuse("old_credential_assignment_not_exact")
    target = "/run/credentials/" + unit + "/worker.secret"
    props[matches[0]] = ENV_KEY + "=" + target
    if not all(x in props for x in (
        "AGENT_STUDIO_PG_HOST=127.0.0.1",
        "AGENT_STUDIO_PG_PORT=5333",
        "AGENT_STUDIO_PG_DATABASE=agent_studio",
        "AGENT_STUDIO_PG_WORKER_USER=agentstudio_stage_worker",
        "AGENT_STUDIO_PG_BAOTA18_ENABLED=true",
        "AGENT_STUDIO_PG_PILOT_ENABLED=true",
    )):
        refuse("database_target_configuration_changed")
    corrected = list(original)
    corrected[index] = "--property=Environment=" + " ".join(props)
    if sum(a != b for a, b in zip(original, corrected)) != 1 or \
       len(original) != len(corrected) or \
       "%d/worker.secret" in " ".join(corrected):
        refuse("patch_scope_unexpected")
    return corrected


def plan(stage, diag, operator):
    old_plan, _ = stage.plan(diag, operator)
    if old_plan.get("ready_for_stage_probe") is not True:
        refuse("previous_readiness_failed")
    prepare = stage.approved_argv(diag, operator)
    prepare_fixed = fixed_argv(prepare, "prepare", operator)
    if prepare_fixed[-4:] != [
        str(operator.NODE), "--experimental-strip-types",
        str(stage.PROBE), "--preflight"
    ]:
        refuse("stage_entrypoint_not_exact")
    # Verify the independent model credential contract OFFLINE only.
    model_original = operator.transient_args("model")
    model_fixed = fixed_argv(model_original, "model", operator)
    if model_fixed[-4:] != [
        str(operator.NODE), "--experimental-strip-types",
        str(ROOT / "services/pg-api/src/model-worker-loop.ts"),
        "--preflight"
    ]:
        refuse("model_contract_not_exact")
    if not operator.old_services_active() or not operator.unit_is_clear(
            "agentstudio-pg18-prepare"):
        refuse("old_services_or_unit_not_ready")
    return {
        "mode": "pg18_fixed_credential_plan",
        "old_manifests_unchanged": True,
        "new_manifest_verified": True,
        "prepare_absolute_credential_path": True,
        "model_absolute_credential_path_offline_only": True,
        "nonroot_and_sandbox_properties_preserved": True,
        "target_pg18_localhost": True,
        "only_prepare_stage_probe": True,
        "would_start_transient": False,
        "credential_bytes_read": False,
        "db_connected": False,
        "model_worker_started": False,
        "task_worker_started": False,
        "production_cutover_allowed": False,
    }, prepare_fixed


def run_one(stage, diag, operator):
    _, argv = plan(stage, diag, operator)
    try:
        completed = subprocess.run(
            argv, cwd=ROOT, capture_output=True, text=True,
            timeout=65, check=False, stdin=subprocess.DEVNULL,
            env={"PATH": "/usr/bin:/bin", "HOME": "/tmp", "LANG": "C"})
        exit_code = completed.returncode
        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
        result = stage.parse_stage(stdout)
        classifications = ([] if result is not None
                           else diag.classify(stdout, stderr))
    except (OSError, subprocess.TimeoutExpired):
        exit_code = None
        stdout = ""
        stderr = ""
        result = None
        classifications = ["TRANSIENT_FAILED_OR_TIMED_OUT"]
    if not operator.old_services_active():
        classifications.append("ORIGINAL_POCKETBASE_NOT_ACTIVE")
    verified = (exit_code == 0 and result == ("passed", "complete")
                and not classifications)
    return {
        "mode": "pg18_fixed_credential_prepare_stage_result",
        "systemd_run_exit_code": exit_code,
        "stage_code": result[1] if result else "no_stage_json",
        "stage_status": result[0] if result else "unavailable",
        "prepare_stage_verified": verified,
        "diagnostic_codes": sorted(set(classifications)),
        "raw_output_disclosed": False,
        "credential_bytes_disclosed": False,
        "database_writes_intended": False,
        "task_worker_started": False,
        "model_worker_started": False,
        "production_cutover_allowed": False,
    }


def main(argv):
    if argv not in (["--plan"],
                    ["--probe-once", "--approve-readonly-credential-fix"]):
        refuse("explicit_mode_required")
    stage, diag, operator = verified_sources()
    if argv == ["--plan"]:
        report, _ = plan(stage, diag, operator)
    else:
        report = run_one(stage, diag, operator)
    print(json.dumps(report, sort_keys=True))
    if argv[0] != "--plan" and not report["prepare_stage_verified"]:
        raise SystemExit(3)


if __name__ == "__main__":
    main(sys.argv[1:])

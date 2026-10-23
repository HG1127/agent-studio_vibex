#!/usr/bin/env python3
"""Root-operator, opt-in non-root SYSTEMD PG18 Worker READ-ONLY preflight.

--plan has no database connection, secret read, filesystem writes or systemd
activation. --run --approve-transient-readonly links an existing reviewed
pg driver into a NEW isolated package folder and starts exactly two transient
oneshot systemd --preflight processes. Never invokes --serve.
"""
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

ROOT = Path("/opt/agentstudio-pg18-worker-preflight-v1")
OPS = ROOT / "ops"
MANIFEST = ROOT / "SHA256SUMS"
NODE = Path("/opt/agentstudio-node24/bin/node")
DRIVER = Path("/opt/agentstudio-pg18-api-preflight-v1/services/pg-api/node_modules")
LINK = ROOT / "services/pg-api/node_modules"
SECRET_DIR = Path("/root/.agentstudio-pg18-secrets")
SECRET = SECRET_DIR / "worker.secret"
RUN = "/usr/bin/systemd-run"
SYSTEMCTL = "/usr/bin/systemctl"
PACKAGE_VERSION = "8.23.1"
KINDS = {
    "prepare": ("agentstudio-pg18-prepare", "worker-loop.ts"),
    "model": ("agentstudio-pg18-model", "model-worker-loop.ts"),
}
SOURCES = (
    "ops/baota-pg18-nonroot-worker-preflight.py",
    "services/pg-api/src/worker-loop.ts",
    "services/pg-api/src/model-worker-loop.ts",
    "services/pg-api/src/worker-activation-guard.ts",
    "services/pg-api/src/worker-role-preflight.ts",
    "services/pg-api/src/optional-credential-boundary.ts",
    "services/pg-api/src/knowledge-content-privileges.ts",
    "services/pg-api/src/knowledge-embedding-privileges.ts",
    "services/pg-api/src/knowledge-index-audit.ts",
    "services/pg-api/src/knowledge-query-audit.ts",
    "services/pg-api/src/knowledge-execution-audit.ts",
    "services/pg-api/src/knowledge-sharing-policy.ts",
    "services/pg-api/src/worker-credential-policy.ts",
    "services/pg-api/src/pg18-native-worker-readonly.ts",
    "services/pg-api/src/pg-runtime-target.ts",
    "services/pg-api/src/contracts.ts",
)


def stop(code):
    raise SystemExit("PG18_NONROOT_PREFLIGHT_REFUSED:" + code)


def details(location):
    try:
        return location.lstat()
    except OSError:
        return None


def trusted_dir(location, readable=True):
    x = details(location)
    return bool(x and stat.S_ISDIR(x.st_mode) and x.st_uid == 0
                and (x.st_mode & 0o022) == 0
                and (not readable or x.st_mode & 0o005 == 0o005))


def trusted_file(location, readable=True):
    x = details(location)
    return bool(x and stat.S_ISREG(x.st_mode) and x.st_uid == 0
                and (x.st_mode & 0o022) == 0
                and (not readable or x.st_mode & 0o004 != 0))


def private_secret():
    root = details(SECRET_DIR)
    item = details(SECRET)
    return bool(root and item and stat.S_ISDIR(root.st_mode)
                and root.st_uid == 0 and (root.st_mode & 0o077) == 0
                and stat.S_ISREG(item.st_mode) and item.st_uid == 0
                and (item.st_mode & 0o077) == 0
                and 32 <= item.st_size <= 512)


def run_checked(argv, timeout=12):
    try:
        return subprocess.run(argv, cwd=ROOT, capture_output=True, text=True,
                              timeout=timeout, check=False,
                              env={"PATH": "/usr/bin:/bin", "LANG": "C",
                                   "HOME": "/tmp"}, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired):
        stop("required_command_unavailable")


def manifest_ok():
    if not trusted_dir(ROOT) or not trusted_file(MANIFEST):
        return False
    for name in SOURCES:
        file = ROOT / name
        if not trusted_file(file):
            return False
    result = run_checked(["/usr/bin/sha256sum", "-c", str(MANIFEST)], 20)
    return result.returncode == 0


def pg_driver_ok():
    # The dependency folder must be non-root traversable, root-owned, and
    # non-writable by any other account. Reuse only this exact installed version.
    parents = [Path("/opt"),
               Path("/opt/agentstudio-pg18-api-preflight-v1"),
               Path("/opt/agentstudio-pg18-api-preflight-v1/services"),
               Path("/opt/agentstudio-pg18-api-preflight-v1/services/pg-api"),
               DRIVER]
    if not all(trusted_dir(d) for d in parents):
        return False
    item = DRIVER / "pg/package.json"
    if not trusted_file(item):
        return False
    try:
        meta = json.loads(item.read_text("utf8"))
    except (ValueError, OSError, UnicodeError):
        return False
    return meta.get("name") == "pg" and meta.get("version") == PACKAGE_VERSION


def source_tree_traversable():
    return all(trusted_dir(ROOT / rel) for rel in (
        "ops", "services", "services/pg-api", "services/pg-api/src"))


def old_services_active():
    return all(run_checked([SYSTEMCTL, "is-active", service], 8).stdout.strip()
               == "active" for service in (
                   "agentstudio-lan-pocketbase", "agentstudio-lan-worker"))


def link_state():
    item = details(LINK)
    if item is None:
        return "absent"
    if stat.S_ISLNK(item.st_mode):
        try:
            if LINK.resolve(strict=True) == DRIVER.resolve(strict=True):
                return "exact"
        except OSError:
            pass
    return "conflict"


def unit_is_clear(name):
    result = run_checked([SYSTEMCTL, "show", "--property=LoadState",
                          "--value", name + ".service"], 9)
    return result.returncode == 0 and result.stdout.strip() == "not-found"


def plan():
    checks = {
        "linux_root_operator": sys.platform == "linux"
            and hasattr(os, "geteuid") and os.geteuid() == 0,
        "package_manifest_valid": manifest_ok(),
        "source_readable_by_nonroot": source_tree_traversable(),
        "node24_binary_executable": node24_ready(),
        "pg_8_23_1_existing_trusted": pg_driver_ok(),
        "protected_worker_credential_metadata": private_secret(),
        "systemd_run_available": Path(RUN).is_file() and os.access(RUN, os.X_OK),
        "old_pocketbase_services_active": old_services_active(),
        "isolated_driver_link_not_conflicting": link_state() != "conflict",
        "transient_unit_names_free": all(unit_is_clear(name)
                                         for name, _ in KINDS.values()),
    }
    return {
        "mode": "offline_plan",
        "target": "127.0.0.1:5333/agent_studio",
        "runtime_directory": str(ROOT),
        "existing_driver_directory": str(DRIVER),
        "requires_new_npm_install": False,
        "checks": checks,
        "ready_for_nonroot_preflight": all(checks.values()),
        "secret_contents_accessed": False,
        "db_connected": False,
        "db_writes_performed": False,
        "worker_started": False,
        "systemd_units_started": False,
        "production_cutover_allowed": False,
    }


def install_driver_link():
    if link_state() == "absent":
        try:
            LINK.symlink_to(DRIVER, target_is_directory=True)
        except OSError:
            stop("driver_link_creation_failed")
    if link_state() != "exact":
        stop("driver_link_conflict")


def node24_ready():
    # Do not execute an untrusted or user-writable Node binary as a systemd
    # credential-consuming process. Require root-owned, traversable parents.
    parents = [Path("/opt"), Path("/opt/agentstudio-node24"), NODE.parent]
    if not all(trusted_dir(folder) for folder in parents) or \
            not trusted_file(NODE) or not os.access(NODE, os.X_OK):
        return False
    return run_checked([str(NODE), "--version"], 8).stdout.strip().startswith("v24.")


def transient_args(kind):
    unit, file = KINDS[kind]
    # One Environment property to avoid repeated systemd D-Bus property
    # assignments replacing earlier values.
    env = {
        "AGENT_STUDIO_PG_WORKER_PASSWORD_FILE": "%d/worker.secret",
        "AGENT_STUDIO_PG_PILOT_ENABLED": "true",
        "AGENT_STUDIO_PG_BAOTA18_ENABLED": "true",
        "AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED": "true",
        "AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED": "true",
        "AGENT_STUDIO_PG_HOST": "127.0.0.1",
        "AGENT_STUDIO_PG_PORT": "5333",
        "AGENT_STUDIO_PG_DATABASE": "agent_studio",
        "AGENT_STUDIO_PG_WORKER_USER": "agentstudio_stage_worker",
    }
    props = [
        "Type=oneshot",
        "User=" + unit,
        "DynamicUser=yes",
        "WorkingDirectory=" + str(ROOT / "services/pg-api"),
        "LoadCredential=worker.secret:" + str(SECRET),
        "Environment=" + " ".join(k + "=" + v for k, v in env.items()),
        "UnsetEnvironment=DATABASE_URL PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGOPTIONS",
        "Restart=no", "UMask=0077", "TimeoutStartSec=40s",
        "NoNewPrivileges=yes", "PrivateTmp=yes", "ProtectSystem=strict",
        "ProtectHome=yes", "ProtectKernelModules=yes",
        "ProtectKernelTunables=yes", "ProtectControlGroups=yes",
        "RestrictSUIDSGID=yes", "LockPersonality=yes",
        "RestrictAddressFamilies=AF_UNIX AF_INET",
        "IPAddressDeny=any", "IPAddressAllow=127.0.0.0/8",
        "CapabilityBoundingSet=", "AmbientCapabilities=",
    ]
    args = [RUN, "--system", "--wait", "--collect", "--pipe",
            "--unit=" + unit + ".service"]
    for item in props:
        args.extend(["--property=" + item])
    return args + [str(NODE), "--experimental-strip-types",
                   str(ROOT / "services/pg-api/src" / file), "--preflight"]


def run_preflight():
    before = plan()
    if not before["ready_for_nonroot_preflight"]:
        stop("offline_plan_not_ready")
    install_driver_link()
    try:
        driver = subprocess.run([str(NODE), "-e",
            "const pg=require('pg');if(typeof pg.Pool!=='function')process.exit(3)"],
            cwd=ROOT / "services/pg-api", capture_output=True, text=True,
            timeout=12, env={"PATH": "/usr/bin:/bin", "HOME": "/tmp"},
            stdin=subprocess.DEVNULL, check=False)
    except (OSError, subprocess.TimeoutExpired):
        stop("existing_pg_driver_load_failed")
    if driver.returncode != 0:
        stop("existing_pg_driver_load_failed")
    results = []
    for kind in ("prepare", "model"):
        # Ensure a previous invocation cannot reuse the same unit name.
        if not unit_is_clear(KINDS[kind][0]):
            stop("transient_unit_name_in_use")
        args = transient_args(kind)
        try:
            completed = subprocess.run(
                args, capture_output=True, text=True, timeout=65,
                env={"PATH": "/usr/bin:/bin", "HOME": "/tmp", "LANG": "C"},
                stdin=subprocess.DEVNULL, check=False)
        except (OSError, subprocess.TimeoutExpired):
            stop("transient_" + kind + "_failed")
        if completed.returncode != 0:
            stop("transient_" + kind + "_failed")
        # Fail closed if systemd succeeded but Node did not return expected
        # explicit no-work preflight evidence.
        records = []
        for line in completed.stdout.splitlines():
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            if isinstance(rec, dict):
                records.append(rec)
        valid = [item for item in records if item.get("mode") == "preflight"
                 and item.get("worker") == kind
                 and item.get("target") == "agent_studio"
                 and item.get("database_port") == 5333
                 and item.get("verified_roles") is True
                 and item.get("db_writes_performed") is False
                 and item.get("external_model_calls") is False
                 and item.get("worker_started") is False
                 and item.get("production_cutover_allowed") is False]
        if len(valid) != 1:
            stop("transient_" + kind + "_evidence_missing")
        results.append({"worker": kind, "nonroot_preflight_passed": True,
                        "database_target_verified": True,
                        "worker_started": False})
    if not old_services_active():
        stop("original_pocketbase_service_status_changed")
    return {
        "mode": "transient_nonroot_pg18_preflight",
        "target": "127.0.0.1:5333/agent_studio",
        "tested": results,
        "nonroot_systemd_preflight_verified": True,
        "driver_reused": True,
        "systemd_transient_oneshots": len(results),
        "persistent_services_installed": False,
        "db_writes_performed": False,
        "worker_started": False,
        "model_calls_performed": False,
        "pocketbase_services_unchanged": True,
        "production_cutover_allowed": False,
    }


def main(argv):
    if argv == ["--plan"]:
        print(json.dumps(plan(), sort_keys=True))
    elif argv == ["--run", "--approve-transient-readonly"]:
        print(json.dumps(run_preflight(), sort_keys=True))
    else:
        stop("explicit_plan_or_approved_readonly_run_required")


if __name__ == "__main__":
    main(sys.argv[1:])

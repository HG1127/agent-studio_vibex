#!/usr/bin/env python3
"""Root-owned LAN release activator installed manually outside the Git checkout.

This reviewed script must be installed to
/usr/local/libexec/agentstudio-lan/agentstudio-lan-deploy.py (root:root 0755).
It is never modified by automated pulls. The existing PocketBase database,
user attachments and keys always remain outside the versioned code releases.
CLI: agentstudio-lan-deploy.py <exact-40-character-main-SHA>
     agentstudio-lan-deploy.py <SHA> --reviewed-runtime (operator only)
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import time
from datetime import datetime, timezone
from urllib.request import urlopen

BASE = Path("/srv/agent-studio-lan")
DATA = Path("/var/lib/agentstudio-lan/pb_data/data.db")
BACKUPS = Path("/var/backups/agentstudio-lan")
ENV_FILE = Path("/etc/agentstudio-lan/studio.env")
ORIGIN = "https://192.168.1.133:8443"
CA_CERT = Path("/etc/agentstudio-lan/tls/agentstudio-root-ca.crt")
NGINX_SITE = Path("/www/server/panel/vhost/nginx/192.168.1.133_8090.conf")
USER = "agentstudio-lan"
PB_SERVICE = "agentstudio-lan-pocketbase.service"
WORKER_SERVICE = "agentstudio-lan-worker.service"
BACKEND = "http://127.0.0.1:7100"
MAX_FILES = 2501  # includes release-manifest.json
MAX_BYTES = 180 * 1024 * 1024
MAX_COMPRESSED_BYTES = 100 * 1024 * 1024
MAX_SINGLE_FILE_BYTES = 32 * 1024 * 1024
MAX_MANIFEST_BYTES = 1024 * 1024
RESTRICTED_SEGMENT = re.compile(r"^(?:\.git|\.env(?:\..*)?|pb_data|pb_data_backup|node_modules|secrets?|secret_files|credentials(?:\..*)?)$", re.I)
RESTRICTED_EXT = re.compile(r"\.(?:db|sqlite3?|wal|shm|key|pem|p12|pfx|exe|dll|zip|7z|rar|tgz|gz|tar|bak|backup|dump)$", re.I)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
CHECKSUM_RE = re.compile(r"^[0-9a-f]{64}$")
FILE_ALLOWLIST = {"package.json", "src/lib/scheduleTime.js"}
PREFIXES = ("dist/", "pocketbase/pb_hooks/", "pocketbase/pb_migrations/", "worker/")


class DeploymentRefused(RuntimeError):
    pass


def safe_rel(name: str) -> str:
    """Accept tar ./prefix, but never traversal, duplicates, links or odd names."""
    if not isinstance(name, str) or "\\" in name or any(ord(char) < 32 or ord(char) == 127 for char in name) or name.startswith("/"):
        raise DeploymentRefused("unsafe_archive_path")
    parts = name.split("/")
    if parts and parts[0] == ".":
        parts.pop(0)
    # Directory entries often end with a slash.
    if parts and parts[-1] == "":
        parts.pop()
    if not parts:
        return ""
    if any(part in ("", ".", "..") for part in parts):
        raise DeploymentRefused("unsafe_archive_path")
    if parts[0].endswith(":"):
        raise DeploymentRefused("unsafe_archive_path")
    if any(RESTRICTED_SEGMENT.fullmatch(part) for part in parts) or RESTRICTED_EXT.search(parts[-1]):
        raise DeploymentRefused("sensitive_archive_path")
    return "/".join(parts)


def allowed_file(name: str) -> bool:
    try:
        if safe_rel(name) != name:
            return False
    except DeploymentRefused:
        return False
    return name in FILE_ALLOWLIST or any(name.startswith(prefix) for prefix in PREFIXES)


def extract_checked(bundle: Path, destination: Path, commit: str) -> dict:
    """Unpack exclusively regular files and directories, then verify each byte."""
    if not SHA_RE.fullmatch(commit):
        raise DeploymentRefused("commit_must_be_full_sha")
    if bundle.is_symlink() or not bundle.is_file() or bundle.stat().st_size > MAX_COMPRESSED_BYTES:
        raise DeploymentRefused("archive_missing_symlink_or_size_limit")
    if destination.exists() or destination.is_symlink():
        raise DeploymentRefused("candidate_dir_already_exists")
    destination.mkdir(mode=0o755)
    present = set()
    total_bytes = 0
    try:
        with tarfile.open(bundle, "r:gz") as archive:
            members = archive.getmembers()
            if len(members) > MAX_FILES + 500:
                raise DeploymentRefused("archive_file_count_limit")
            for member in members:
                rel = safe_rel(member.name)
                if not rel:
                    if not member.isdir():
                        raise DeploymentRefused("invalid_archive_root")
                    continue
                if member.isdir():
                    if rel not in ("dist", "pocketbase", "pocketbase/pb_hooks",
                                   "pocketbase/pb_migrations", "worker", "src", "src/lib"):
                        if not any(rel.startswith(prefix) for prefix in PREFIXES):
                            raise DeploymentRefused("unexpected_archive_directory")
                    (destination / rel).mkdir(parents=True, exist_ok=True, mode=0o755)
                    continue
                if not member.isfile() or not (allowed_file(rel) or rel == "release-manifest.json"):
                    raise DeploymentRefused("unexpected_archive_member")
                if rel in present or member.size < 0 or member.size > MAX_SINGLE_FILE_BYTES or \
                   (rel == "release-manifest.json" and member.size > MAX_MANIFEST_BYTES):
                    raise DeploymentRefused("duplicate_or_invalid_archive_file")
                present.add(rel)
                total_bytes += member.size
                if len(present) > MAX_FILES or total_bytes > MAX_BYTES:
                    raise DeploymentRefused("archive_limits_exceeded")
                target = destination / rel
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                source = archive.extractfile(member)
                if source is None:
                    raise DeploymentRefused("archive_content_missing")
                with target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                os.chmod(target, 0o644)
        if "release-manifest.json" not in present:
            raise DeploymentRefused("release_manifest_missing")
        release = json.loads((destination / "release-manifest.json").read_text("utf-8"))
        if release.get("schema") != 1 or release.get("commit") != commit:
            raise DeploymentRefused("release_manifest_commit_mismatch")
        declarations = release.get("files")
        if not isinstance(declarations, list) or len(declarations) > MAX_FILES:
            raise DeploymentRefused("release_manifest_invalid")
        claimed = set()
        for item in declarations:
            if not isinstance(item, dict):
                raise DeploymentRefused("release_manifest_invalid")
            name, digest, size = item.get("path"), item.get("sha256"), item.get("bytes")
            if not isinstance(name, str) or safe_rel(name) != name or not allowed_file(name):
                raise DeploymentRefused("release_manifest_unsafe_path")
            if name in claimed or not isinstance(size, int) or isinstance(size, bool) or size < 0:
                raise DeploymentRefused("release_manifest_duplicate_or_size")
            if not isinstance(digest, str) or not CHECKSUM_RE.fullmatch(digest):
                raise DeploymentRefused("release_manifest_bad_hash")
            claimed.add(name)
            raw = (destination / name).read_bytes()
            if len(raw) != size or hashlib.sha256(raw).hexdigest() != digest:
                raise DeploymentRefused("release_content_hash_mismatch")
        if claimed != present - {"release-manifest.json"}:
            raise DeploymentRefused("release_manifest_file_set_mismatch")
        for name in ("dist/index.html", "package.json", "worker/run.mjs", "src/lib/scheduleTime.js"):
            if name not in claimed:
                raise DeploymentRefused("missing_required_runtime_file")
        return {"commit": commit, "files": len(claimed)}
    except BaseException:
        # This is a freshly-created candidate directory, never the active
        # release; no persistent DB path is under destination.
        shutil.rmtree(destination)
        raise


def sudo(*arguments: str) -> None:
    # Root-owned controller is manually installed outside the auto-updated app.
    if os.geteuid() != 0:
        raise DeploymentRefused("root_operator_required")
    subprocess.run(list(arguments), check=True, timeout=75)


def require_runtime() -> None:
    if os.geteuid() != 0:
        raise DeploymentRefused("root_operator_required")
    for directory in (BASE, DATA.parent, BACKUPS, BASE / "releases", BASE / "incoming"):
        if not directory.is_dir() or directory.is_symlink():
            raise DeploymentRefused("lan_directory_missing_or_symlink")
    # The existing app used to own BASE; moving to versioned releases requires
    # a one-time non-recursive root chown of BASE before automation is enabled.
    # Never allow the runtime app or builder to replace current/ or releases/.
    for controlled in (BASE, BASE / "releases", BASE / "incoming", BACKUPS):
        stat = controlled.stat()
        if stat.st_uid != 0 or stat.st_mode & 0o022:
            raise DeploymentRefused("lan_release_root_not_operator_owned")
    if ENV_FILE.is_symlink() or DATA.is_symlink() or not ENV_FILE.is_file() or not DATA.is_file():
        raise DeploymentRefused("lan_env_or_sqlite_missing")
    env = {}
    for line in ENV_FILE.read_text("utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise DeploymentRefused("lan_env_invalid")
        k, v = line.split("=", 1)
        if k in env:
            raise DeploymentRefused("duplicate_lan_env_key")
        env[k] = v.strip().strip('"').strip("'")
    expected = {
        "AGENT_STUDIO_AUTH_MODE": "standalone",
        "AGENT_STUDIO_ALLOW_ANON": "false",
        "AGENT_STUDIO_STRICT_SECRETS": "true",
        "AGENT_STUDIO_BACKGROUND_WORKER": "true",
        "AGENT_STUDIO_WORKER_URL": BACKEND,
        "AGENT_STUDIO_WORKER_INTERNAL_URL": BACKEND,
    }
    if any(env.get(k) != v for k, v in expected.items()):
        raise DeploymentRefused("lan_env_contract_mismatch")
    if env.get("AGENT_STUDIO_BOOTSTRAP_SECRET"):
        raise DeploymentRefused("bootstrap_secret_must_remain_revoked")
    if (len(env.get("AGENT_STUDIO_SECRET_KEY", "").encode()) != 32 or
        len(env.get("AGENT_STUDIO_WORKER_TOKEN", "")) < 32 or
        env.get("AGENT_STUDIO_LEGACY_TEST_ONLY") == "true"):
        raise DeploymentRefused("lan_runtime_secrets_invalid")
    for checked in (CA_CERT, NGINX_SITE):
        if checked.is_symlink() or not checked.is_file():
            raise DeploymentRefused("trusted_ca_or_nginx_site_missing")
    nginx = NGINX_SITE.read_text("utf8")
    pb_unit = Path("/etc/systemd/system/" + PB_SERVICE).read_text("utf8")
    worker_unit = Path("/etc/systemd/system/" + WORKER_SERVICE).read_text("utf8")
    if ("root /srv/agent-studio-lan/current/dist;" not in nginx or
        "/srv/agent-studio-lan/current/pocketbase/pb_hooks" not in pb_unit or
        "/srv/agent-studio-lan/current/worker/run.mjs" not in worker_unit):
        raise DeploymentRefused("versioned_current_not_yet_connected")


def sqlite_backup(commit: str) -> Path:
    """After PB is stopped, snapshot SQLite AND PB uploaded storage together."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    folder = BACKUPS / (stamp + "-" + commit[:12])
    if folder.exists() or folder.is_symlink():
        raise DeploymentRefused("backup_collision")
    folder.mkdir(mode=0o700)
    try:
        live_root = DATA.parent
        dest_root = folder / "pb_data"
        dest_root.mkdir(mode=0o700)
        source = sqlite3.connect(DATA.as_uri() + "?mode=ro", uri=True, timeout=15)
        try:
            target = sqlite3.connect(str(dest_root / "data.db"), timeout=15)
            try:
                source.backup(target)
                check = target.execute("PRAGMA quick_check").fetchone()
                if not check or check[0] != "ok":
                    raise DeploymentRefused("sqlite_backup_integrity_failed")
            finally:
                target.close()
        finally:
            source.close()
        for original in live_root.rglob("*"):
            rel = original.relative_to(live_root)
            if rel.as_posix() in ("data.db", "data.db-wal", "data.db-shm"):
                continue
            if original.is_symlink():
                raise DeploymentRefused("pb_data_symlink_requires_manual_review")
            destination = dest_root / rel
            if original.is_dir():
                destination.mkdir(parents=True, mode=0o700, exist_ok=True)
            elif original.is_file():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(original, destination)
            else:
                raise DeploymentRefused("unexpected_pb_data_file_type")
        return folder
    except BaseException:
        shutil.rmtree(folder)
        raise


def switch_to(commit: str) -> None:
    temporary = BASE / (".current-next-" + str(os.getpid()))
    if temporary.exists() or temporary.is_symlink():
        raise DeploymentRefused("temporary_symlink_collision")
    temporary.symlink_to("releases/" + commit)
    os.replace(temporary, BASE / "current")


def get_previous() -> str | None:
    current = BASE / "current"
    if not current.exists() and not current.is_symlink():
        return None
    if not current.is_symlink():
        raise DeploymentRefused("current_must_be_version_symlink")
    value = os.readlink(current)
    if not re.fullmatch(r"releases/[0-9a-f]{40}", value):
        raise DeploymentRefused("current_points_outside_versioned_releases")
    return value.split("/")[1]


def migration_signature(release_dir: Path) -> dict[str, str]:
    """Do not silently run changed PocketBase migrations on an auto-update."""
    manifest = json.loads((release_dir / "release-manifest.json").read_text("utf-8"))
    entries = manifest.get("files")
    if not isinstance(entries, list):
        raise DeploymentRefused("previous_release_manifest_invalid")
    signature = {}
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            raise DeploymentRefused("release_manifest_invalid")
        relative = entry["path"]
        if relative.startswith("pocketbase/pb_migrations/"):
            if not allowed_file(relative) or not CHECKSUM_RE.fullmatch(str(entry.get("sha256", ""))):
                raise DeploymentRefused("release_migration_manifest_invalid")
            signature[relative] = entry["sha256"]
    return signature


def verify_migration_compatibility(previous: Path, candidate: Path) -> None:
    if migration_signature(previous) != migration_signature(candidate):
        raise DeploymentRefused("pocketbase_migration_changed_requires_manual_review")


def await_healthy() -> None:
    deadline = time.monotonic() + 75
    while time.monotonic() < deadline:
        try:
            with urlopen(BACKEND + "/api/health", timeout=4) as response:
                if response.status == 200:
                    break
        except Exception:
            time.sleep(2)
    else:
        raise DeploymentRefused("pocketbase_health_timeout")
    sudo("/usr/bin/systemctl", "is-active", "--quiet", PB_SERVICE)
    sudo("/usr/bin/systemctl", "is-active", "--quiet", WORKER_SERVICE)
    with urlopen(BACKEND + "/api/studio/bootstrap/status", timeout=5) as response:
        status = json.load(response)
        if status.get("initialized") is not True or status.get("can_setup") is not False:
            raise DeploymentRefused("bootstrap_status_not_secure")
    # The actual BaoTa TLS server listens on 192.168.1.133:8443, *not*
    # 127.0.0.1:8443. Connect to the real LAN IP and validate its IP SAN.
    curl = ["/usr/bin/curl", "--silent", "--show-error", "--max-time", "15",
            "--noproxy", "*", "--cacert", str(CA_CERT)]
    for uri, expected in (
        (ORIGIN + "/login", "200"),
        (ORIGIN + "/__pb/api/health", "200"),
        (ORIGIN + "/__pb/api/studio/me", "401"),
        (ORIGIN + "/__pb/_/", "403"),
    ):
        output = subprocess.check_output(curl + ["-o", "/dev/null", "-w", "%{http_code}", uri], timeout=21)
        if output.decode("ascii").strip() != expected:
            raise DeploymentRefused("lan_https_gateway_health_failed")


def changed_runtime(previous: Path, candidate: Path) -> list[str]:
    def entries(directory: Path) -> dict[str, str]:
        raw = json.loads((directory / "release-manifest.json").read_text("utf8"))
        if raw.get("schema") != 1:
            raise DeploymentRefused("release_manifest_invalid")
        return {item["path"]: item["sha256"] for item in raw["files"]}
    old, new = entries(previous), entries(candidate)
    return sorted(path for path in old.keys() | new.keys()
                  if not path.startswith("dist/") and old.get(path) != new.get(path))


def deploy(commit: str, reviewed_runtime: bool = False) -> None:
    if not SHA_RE.fullmatch(commit):
        raise DeploymentRefused("invalid_sha")
    require_runtime()
    previous = get_previous()
    if previous is None:
        raise DeploymentRefused("operator_must_bootstrap_versioned_current_first")
    if previous == commit:
        await_healthy()
        print("LAN_ALREADY_CURRENT", commit)
        return
    bundle = BASE / "incoming" / (commit + ".tar.gz")
    checksum = BASE / "incoming" / (commit + ".sha256")
    if bundle.is_symlink() or not bundle.is_file() or checksum.is_symlink() or not checksum.is_file():
        raise DeploymentRefused("new_release_artifacts_missing")
    expected = checksum.read_text("ascii").strip()
    if not CHECKSUM_RE.fullmatch(expected):
        raise DeploymentRefused("checksum_invalid")
    with bundle.open("rb") as reader:
        actual = hashlib.sha256()
        for part in iter(lambda: reader.read(1024 * 1024), b""):
            actual.update(part)
    if actual.hexdigest() != expected:
        raise DeploymentRefused("release_checksum_mismatch")
    if bundle.stat().st_size > MAX_COMPRESSED_BYTES:
        raise DeploymentRefused("release_archive_too_large")
    candidate = BASE / "releases" / commit
    if candidate.exists() or candidate.is_symlink():
        raise DeploymentRefused("candidate_must_be_new")
    extract_checked(bundle, candidate, commit)
    try:
        previous_dir = BASE / "releases" / previous
        verify_migration_compatibility(previous_dir, candidate)
        if changed_runtime(previous_dir, candidate) and not reviewed_runtime:
            raise DeploymentRefused("backend_or_worker_change_requires_operator_review")
        nginx = "/www/server/nginx/sbin/nginx" if Path("/www/server/nginx/sbin/nginx").is_file() else "/usr/sbin/nginx"
        sudo(nginx, "-t")
    except BaseException:
        shutil.rmtree(candidate)
        raise

    # Quiescent backup must fit on the backup volume. Fail before stopping
    # services if insufficient storage. Actual backup still verifies SQLite.
    data_bytes = sum(p.stat().st_size for p in DATA.parent.rglob("*") if p.is_file())
    remaining = shutil.disk_usage(BACKUPS).free
    if remaining < max(data_bytes * 2, data_bytes + 512 * 1024 * 1024):
        raise DeploymentRefused("insufficient_disk_for_lan_backup")
    switched = False
    backup = None
    try:
        sudo("/usr/bin/systemctl", "stop", WORKER_SERVICE)
        sudo("/usr/bin/systemctl", "stop", PB_SERVICE)
        backup = sqlite_backup(commit)
        switch_to(commit)
        switched = True
        sudo("/usr/bin/systemctl", "start", PB_SERVICE)
        sudo("/usr/bin/systemctl", "start", WORKER_SERVICE)
        await_healthy()
        print("LAN_DEPLOY_OK", commit, "data_backup=yes")
    except BaseException:
        try:
            sudo("/usr/bin/systemctl", "stop", WORKER_SERVICE)
            sudo("/usr/bin/systemctl", "stop", PB_SERVICE)
            if switched:
                switch_to(previous)
            sudo("/usr/bin/systemctl", "start", PB_SERVICE)
            sudo("/usr/bin/systemctl", "start", WORKER_SERVICE)
            await_healthy()
            print("LAN_CODE_ROLLBACK_OK", previous, file=sys.stderr)
        except Exception:
            print("LAN_RECOVERY_REQUIRES_OPERATOR", file=sys.stderr)
        if backup:
            print("LAN_DATA_BACKUP_SAVED; database never auto-restored", file=sys.stderr)
        raise


def main() -> int:
    if len(sys.argv) not in (2, 3):
        raise DeploymentRefused("usage_full_sha_optional_reviewed_runtime")
    commit = sys.argv[1]
    reviewed_runtime = len(sys.argv) == 3 and sys.argv[2] == "--reviewed-runtime"
    if len(sys.argv) == 3 and not reviewed_runtime:
        raise DeploymentRefused("invalid_review_flag")
    if not SHA_RE.fullmatch(commit):
        raise DeploymentRefused("invalid_sha")
    import fcntl  # Imported on Linux, not in offline Windows tests.
    if not BASE.is_dir() or BASE.is_symlink():
        raise DeploymentRefused("lan_root_not_prepared")
    with (BASE / ".lan-deploy.lock").open("a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy(commit, reviewed_runtime=reviewed_runtime)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (DeploymentRefused, OSError, subprocess.CalledProcessError, sqlite3.Error, tarfile.TarError) as ex:
        # Return a bounded operational classification, never environment values.
        detail = str(ex)
        if isinstance(ex, subprocess.CalledProcessError):
            detail = "service_or_https_check_failed"
        print("LAN_DEPLOY_BLOCKED:" + detail[:110], file=sys.stderr)
        raise SystemExit(1)

#!/usr/bin/env python3
"""Agent Studio LAN outbound CI-gated updater (operator-installed, root owned).

--check: read-only GitHub CI verification.
--stage: fetch/build a pinned release from main, leaving live services unchanged.
--bootstrap: stage the already-installed same SHA and create only the initial
             versioned 'current' symlink; operator must switch nginx/systemd
             paths manually before activating a timer.
--auto: release check, stage and activate; requires a root-owned enable marker.

No incoming SSH, no production PostgreSQL, no deletions of historical releases,
no automatic DB restore. Only a successful GitHub push CI for exact main SHA.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

BASE = Path("/srv/agent-studio-lan")
BUILDS = BASE / "builds"
INCOMING = BASE / "incoming"
RELEASES = BASE / "releases"
SOURCE = BASE / "source"
GATE = Path("/etc/agentstudio-lan/enable-lan-autoupdate")
BINARY = Path("/opt/agent-studio-lan/tools/bin/pnpm")
NODE = "/usr/bin/node"
BUILDER = "agentstudio-build"
BUILD_HOME = Path("/var/lib/agentstudio-build")
REPOSITORY_URL = "https://github.com/HG1127/agent-studio_vibex.git"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


class PullBlocked(RuntimeError):
    pass


def _module(name: str, filename: Path):
    spec = importlib.util.spec_from_file_location(name, filename)
    if spec is None or spec.loader is None:
        raise PullBlocked("release_module_unavailable")
    item = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(item)
    return item


def controller_modules():
    # Operator manually copies these scripts into protected root-owned /usr/local/libexec.
    root = Path("/usr/local/libexec/agentstudio-lan")
    for p in (root, root / "ci-gate.py", root / "agentstudio-lan-deploy.py",
              root / "pull-update.py"):
        if p.is_symlink() or not p.exists():
            raise PullBlocked("reviewed_operator_scripts_not_installed")
        st = p.stat()
        if st.st_uid != 0 or st.st_mode & 0o022:
            raise PullBlocked("operator_script_not_root_owned")
    return (_module("agentstudio_ci_gate", root / "ci-gate.py"),
            _module("agentstudio_release_activate", root / "agentstudio-lan-deploy.py"))


def subprocess_checked(args: list[str], *, cwd: Path | None = None,
                      as_builder: bool = False, timeout: int = 180) -> str:
    run_args = list(args)
    if as_builder:
        # Trusted root orchestrator must be able to DROP UID/GID; invoking
        # runuser in the old NoNewPrivileges=true parent unit failed with
        # EPERM under Ubuntu's systemd sandbox. setpriv does not use PAM and
        # applies NoNewPrivileges to the unprivileged build CHILD instead.
        # Clear inherited environment: no production tokens/keys may reach
        # git, pnpm, build scripts, or downloaded dependencies.
        run_args = [
            "/usr/bin/setpriv",
            "--reuid=" + BUILDER,
            "--regid=" + BUILDER,
            "--init-groups",
            "--no-new-privs",
            "/usr/bin/env", "-i",
            "HOME=" + str(BUILD_HOME),
            "PATH=/opt/agent-studio-lan/tools/bin:/usr/bin:/bin",
            "GIT_TERMINAL_PROMPT=0",
            "XDG_CACHE_HOME=" + str(BUILD_HOME / ".cache"),
            *run_args,
        ]
    result = subprocess.run(run_args, cwd=cwd, check=True, timeout=timeout,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            encoding="utf8")
    return result.stdout.strip()


def validate_paths() -> None:
    if os.geteuid() != 0:
        raise PullBlocked("root_operator_required")
    if not BUILDS.is_dir() or BUILDS.is_symlink() or not BUILDS.owner() == BUILDER:
        raise PullBlocked("dedicated_builder_directory_not_prepared")
    if not BUILD_HOME.is_dir() or BUILD_HOME.is_symlink():
        raise PullBlocked("builder_home_not_prepared")
    if not BINARY.is_file() or not Path(NODE).is_file() or not Path("/usr/bin/setpriv").is_file():
        raise PullBlocked("node_pnpm_or_setpriv_missing")
    for path in (INCOMING, RELEASES, SOURCE):
        if not path.is_dir() or path.is_symlink():
            raise PullBlocked("lan_release_directories_not_prepared")
    for protected in (BASE, RELEASES, INCOMING):
        st = protected.stat()
        if st.st_uid != 0 or st.st_mode & 0o022:
            raise PullBlocked("release_root_must_be_root_owned")
    for builder_path in (BUILDS, BUILD_HOME):
        st = builder_path.stat()
        if builder_path.owner() != BUILDER or st.st_mode & 0o077:
            raise PullBlocked("builder_directory_permissions_invalid")


def release_sha() -> str | None:
    current = BASE / "current"
    if not current.exists() and not current.is_symlink():
        return None
    if not current.is_symlink():
        raise PullBlocked("current_not_symlink")
    target = os.readlink(current)
    if not re.fullmatch(r"releases/[0-9a-f]{40}", target):
        raise PullBlocked("current_outside_versioned_releases")
    return target.split("/")[1]


def bootstrap_current(lan) -> str:
    """Register the currently RUNNING source build as a versioned baseline.

    Never changes nginx, services, databases or production files. The operator
    later changes three source references to current after making a backup.
    """
    if os.geteuid() != 0:
        raise PullBlocked("root_operator_required")
    if release_sha() is not None:
        raise PullBlocked("versioned_current_already_exists")
    for path in (BASE, SOURCE, RELEASES):
        if not path.is_dir() or path.is_symlink():
            raise PullBlocked("source_or_releases_missing")
    for protected in (BASE, RELEASES):
        st = protected.stat()
        if st.st_uid != 0 or st.st_mode & 0o022:
            raise PullBlocked("root_owned_release_dirs_required")
    git = ["/usr/bin/git", "-c", "safe.directory=" + str(SOURCE), "-C", str(SOURCE)]
    sha = subprocess_checked(git + ["rev-parse", "HEAD"])
    if not SHA_RE.fullmatch(sha):
        raise PullBlocked("installed_source_sha_invalid")
    files = subprocess_checked(git + [
        "ls-files", "-z", "--",
        "pocketbase/pb_hooks/", "pocketbase/pb_migrations/",
        "worker/", "package.json", "src/lib/scheduleTime.js",
    ]).split("\0")
    files = [f for f in files if f]
    tracked_paths = ["pocketbase/pb_hooks/", "pocketbase/pb_migrations/",
                     "worker/", "package.json", "src/lib/scheduleTime.js"]
    subprocess_checked(git + ["diff", "--quiet", "HEAD", "--", *tracked_paths])
    for needed in ("package.json", "worker/run.mjs", "src/lib/scheduleTime.js"):
        if needed not in files:
            raise PullBlocked("baseline_missing_required_runtime")
    dist = SOURCE / "dist"
    if not (dist / "index.html").is_file():
        raise PullBlocked("baseline_frontend_not_built")
    for p in dist.rglob("*"):
        rel = p.relative_to(SOURCE).as_posix()
        if p.is_symlink():
            raise PullBlocked("baseline_symlinks_refused")
        if p.is_file():
            files.append(rel)
        elif not p.is_dir():
            raise PullBlocked("baseline_special_files_refused")
    if not all(lan.allowed_file(name) for name in files):
        raise PullBlocked("baseline_file_outside_allowlist")
    if len(files) > 2500:
        raise PullBlocked("baseline_too_many_files")
    target = RELEASES / sha
    if target.exists() or target.is_symlink():
        raise PullBlocked("baseline_release_already_exists")
    target.mkdir(mode=0o755)
    try:
        manifest, total = [], 0
        for name in sorted(set(files)):
            p = SOURCE / name
            if p.is_symlink() or not p.is_file():
                raise PullBlocked("baseline_nonregular_file")
            raw = p.read_bytes()
            if len(raw) > 32 * 1024 * 1024:
                raise PullBlocked("baseline_single_file_too_large")
            total += len(raw)
            if total > 180 * 1024 * 1024:
                raise PullBlocked("baseline_too_large")
            output = target / name
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(raw)
            os.chmod(output, 0o644)
            manifest.append({"path": name, "sha256": hashlib.sha256(raw).hexdigest(),
                             "bytes": len(raw)})
        (target / "release-manifest.json").write_text(
            json.dumps({"schema": 1, "commit": sha, "files": manifest}, indent=2) + "\n",
            encoding="utf8")
        (BASE / "current").symlink_to("releases/" + sha)
    except BaseException:
        shutil.rmtree(target)
        raise
    return sha


def auto_enabled() -> bool:
    if not GATE.is_file() or GATE.is_symlink():
        return False
    st = GATE.stat()
    if st.st_uid != 0 or st.st_mode & 0o077:
        raise PullBlocked("enable_file_permissions_invalid")
    if GATE.read_text("ascii").strip() != "AUTO_FRONTEND_ONLY":
        raise PullBlocked("enable_file_contents_invalid")
    return True


def stage_release(sha: str, lan_module) -> Path:
    if not SHA_RE.fullmatch(sha):
        raise PullBlocked("invalid_sha")
    archive = INCOMING / (sha + ".tar.gz")
    checksum = INCOMING / (sha + ".sha256")
    if archive.exists() or checksum.exists():
        if archive.is_symlink() or checksum.is_symlink() or not archive.is_file() or not checksum.is_file():
            raise PullBlocked("incoming_artifact_collision")
        if archive.stat().st_size > 100 * 1024 * 1024:
            raise PullBlocked("incoming_archive_too_large")
        claimed = checksum.read_text("ascii").strip()
        if not re.fullmatch(r"[0-9a-f]{64}", claimed):
            raise PullBlocked("incoming_checksum_invalid")
        if hashlib.sha256(archive.read_bytes()).hexdigest() != claimed:
            raise PullBlocked("incoming_bundle_checksum_mismatch")
        return archive

    import pwd  # Only used during actual Linux build operations.
    workspace = Path(tempfile.mkdtemp(prefix="agentstudio-lan-", dir=BUILDS))
    try:
        os.chown(workspace, pwd.getpwnam(BUILDER).pw_uid, pwd.getpwnam(BUILDER).pw_gid)
        subprocess_checked(["/usr/bin/git", "clone", "--depth", "1", "--branch", "main",
                            "--single-branch", "--", REPOSITORY_URL, str(workspace / "repo")],
                           as_builder=True, timeout=240)
        checkout = workspace / "repo"
        commit = subprocess_checked(["/usr/bin/git", "rev-parse", "HEAD"], cwd=checkout, as_builder=True)
        if commit != sha:
            raise PullBlocked("github_main_changed_while_cloning")
        # Lockfile immutable dependency install; run everything as unprivileged
        # builder without access to production SQLite, /etc, or systemd.
        subprocess_checked([str(BINARY), "install", "--frozen-lockfile"],
                           cwd=checkout, as_builder=True, timeout=480)
        subprocess_checked([str(BINARY), "build"],
                           cwd=checkout, as_builder=True, timeout=480)
        staged = workspace / "files"
        subprocess_checked([NODE, "deploy/lan/build-lan-bundle.mjs",
                            "--sha", sha, "--out", str(staged)],
                           cwd=checkout, as_builder=True, timeout=60)
        manifest = json.loads((staged / "release-manifest.json").read_text("utf8"))
        if manifest.get("commit") != sha:
            raise PullBlocked("built_manifest_sha_mismatch")
        temporary = INCOMING / ("." + sha + "." + str(os.getpid()) + ".tar.gz")
        if temporary.exists() or temporary.is_symlink():
            raise PullBlocked("temporary_archive_collision")
        try:
            with tarfile.open(temporary, "w:gz") as output:
                output.add(staged, arcname=".", recursive=True)
            digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
            temporary.replace(archive)
            checksum.write_text(digest + "\n", encoding="ascii")
        finally:
            if temporary.exists():
                temporary.unlink()
        return archive
    finally:
        # Never delete source/ data or historical releases, only our own build dir.
        shutil.rmtree(workspace)


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in ("--check", "--stage", "--bootstrap", "--auto"):
        raise PullBlocked("usage_check_stage_bootstrap_auto")
    mode = sys.argv[1]
    ci, lan = controller_modules()
    if mode == "--bootstrap":
        sha = bootstrap_current(lan)
        print("LAN_BASELINE_REGISTERED", sha, "services_unchanged=yes")
        return 0
    if mode == "--auto" and not auto_enabled():
        print("LAN_AUTO_DISABLED")
        return 0
    sha, run_id = ci.confirmed_head()
    previous = release_sha()
    if mode == "--check":
        print(json.dumps({"status": "LAN_CI_CHECK", "main": sha,
                          "ci_run": run_id, "current": previous,
                          "needs_update": previous != sha}))
        return 0
    validate_paths()
    if previous == sha:
        print("LAN_UP_TO_DATE", sha)
        return 0
    stage_release(sha, lan)
    if mode == "--stage":
        print("LAN_RELEASE_STAGED", sha, "archive_ready=yes")
        return 0
    latest_sha, _ = ci.confirmed_head()
    if latest_sha != sha:
        raise PullBlocked("main_changed_during_build")
    lan.deploy(sha, reviewed_runtime=False)
    print("LAN_OUTBOUND_UPDATE_SUCCEEDED", sha)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        if isinstance(error, (subprocess.CalledProcessError, subprocess.TimeoutExpired)):
            message = "build_or_external_process_failed"
        elif isinstance(error, PullBlocked) or type(error).__name__ in ("CIGateBlocked", "DeploymentRefused"):
            message = str(error)[:120]
        else:
            message = "unexpected_failure_requires_operator_review"
        print("LAN_PULL_BLOCKED:" + message, file=sys.stderr)
        raise SystemExit(2)

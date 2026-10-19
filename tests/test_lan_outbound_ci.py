"""Offline security regression: do not contact user's LAN host or GitHub."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from contextlib import closing
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

CI = load("ci_lan_test", "deploy/lan/ci-gate.py")
PULL = load("pull_lan_test", "deploy/lan/pull-update.py")
LAN = load("release_lan_test", "deploy/lan/agentstudio-lan-deploy.py")
SHA_A = "a" * 40
SHA_B = "b" * 40


def run(sha=SHA_A, **changes):
    item = {"id": 6001, "head_sha": sha, "head_branch": "main", "event": "push",
            "head_repository": {"full_name": CI.REPOSITORY},
            "repository": {"full_name": CI.REPOSITORY},
            "path": CI.WORKFLOW_PATH, "status": "completed",
            "conclusion": "success", "run_attempt": 1,
            "updated_at": "2026-10-19T12:00:00Z"}
    item.update(changes)
    return item


def manifest(path, files):
    path.mkdir(exist_ok=True, parents=True)
    (path / "release-manifest.json").write_text(
        json.dumps({"schema": 1, "commit": SHA_A, "files": [
            {"path": name, "sha256": value, "bytes": 7} for name, value in files.items()
        ]}), encoding="utf8")


class GitHubCIGate(unittest.TestCase):
    def test_accepts_exact_current_main_push_ci_only(self):
        assert CI.parse_head({"object": {"sha": SHA_A}}) == SHA_A
        self.assertEqual(CI.parse_verified_run({"workflow_runs": [run()]}, SHA_A), 6001)

    def test_missing_ci_or_branch_or_fork_or_pr_fails_closed(self):
        for candidate in (
            run(event="pull_request"), run(head_branch="other"),
            run(head_repository={"full_name": "another/repository"}),
            run(repository={"full_name": "another/repository"}),
            run(path=".github/workflows/other.yml"),
            run(head_sha=SHA_B), run(status="in_progress", conclusion=None),
            run(conclusion="failure"), run(conclusion="cancelled"),
        ):
            with self.subTest(candidate=candidate):
                with self.assertRaises(CI.CIGateBlocked):
                    CI.parse_verified_run({"workflow_runs": [candidate]}, SHA_A)

    def test_later_failed_re_run_blocks_earlier_success(self):
        failed = run(id=6002, conclusion="failure", run_attempt=2,
                     updated_at="2026-10-19T12:01:00Z")
        with self.assertRaises(CI.CIGateBlocked):
            CI.parse_verified_run({"workflow_runs": [run(), failed]}, SHA_A)

    def test_main_changes_during_network_check_blocks(self):
        with patch.object(CI, "token_from_file", return_value=None), \
             patch.object(CI, "api_json", side_effect=[
                 {"object": {"sha": SHA_A}},
                 {"workflow_runs": [run()]},
                 {"object": {"sha": SHA_B}},
             ]):
            with self.assertRaisesRegex(CI.CIGateBlocked, "main_advanced"):
                CI.confirmed_head()

    def test_unpinned_host_and_invalid_sha_rejected(self):
        with self.assertRaises(CI.CIGateBlocked):
            CI.api_json("https://evil.example/actions")
        for bad in ("", SHA_A.upper(), SHA_A[:-1], "../etc/passwd"):
            with self.assertRaises(CI.CIGateBlocked):
                CI.parse_head({"object": {"sha": bad}})


class LANReleaseSafety(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="lan-cicd-unit-")
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)

    def test_runtime_diff_guards_hooks_and_worker_but_allows_frontend_only(self):
        prev, newer = self.path / "prev", self.path / "new"
        manifest(prev, {"dist/index.html": "1" * 64, "worker/run.mjs": "3" * 64})
        manifest(newer, {"dist/index.html": "2" * 64, "worker/run.mjs": "3" * 64})
        self.assertEqual(LAN.changed_runtime(prev, newer), [])
        manifest_new = json.loads((newer / "release-manifest.json").read_text())
        manifest_new["files"][1]["sha256"] = "4" * 64
        (newer / "release-manifest.json").write_text(json.dumps(manifest_new))
        self.assertEqual(LAN.changed_runtime(prev, newer), ["worker/run.mjs"])

    def test_archives_never_allow_database_credentials_or_traversal(self):
        for p in ("pb_data/data.db", "dist/.env", "worker/key.pem",
                  "pocketbase/pb_hooks/../secret", "../evil", "/etc/passwd"):
            self.assertFalse(LAN.allowed_file(p), p)

    def test_data_backup_includes_sqlite_and_uploaded_files(self):
        live = self.path / "pb_data"
        live.mkdir()
        with closing(sqlite3.connect(live / "data.db")) as db:
            db.execute("CREATE TABLE agent (id INTEGER)")
            db.execute("INSERT INTO agent (id) VALUES (10)")
            db.commit()
        attachments = live / "storage" / "folder"
        attachments.mkdir(parents=True)
        (attachments / "file.txt").write_text("important", encoding="utf8")
        backup_root = self.path / "backups"
        backup_root.mkdir()
        with patch.object(LAN, "DATA", live / "data.db"), patch.object(LAN, "BACKUPS", backup_root):
            backup = LAN.sqlite_backup(SHA_A)
        self.assertEqual((backup / "pb_data" / "storage/folder/file.txt").read_text(), "important")
        with closing(sqlite3.connect(backup / "pb_data" / "data.db")) as db:
            self.assertEqual(db.execute("SELECT id FROM agent").fetchone()[0], 10)
            self.assertEqual(db.execute("PRAGMA quick_check").fetchone()[0], "ok")

    def test_invalid_existing_checksum_refused_without_replace(self):
        base = self.path / "app"
        incoming = base / "incoming"
        incoming.mkdir(parents=True)
        sha_file = incoming / (SHA_A + ".tar.gz")
        sha_file.write_bytes(b"not a valid archive")
        (incoming / (SHA_A + ".sha256")).write_text("a" * 64)
        with patch.object(PULL, "INCOMING", incoming):
            with self.assertRaises(PULL.PullBlocked):
                PULL.stage_release(SHA_A, LAN)

    def test_worker_and_backend_auto_changes_require_review(self):
        doc = (ROOT / "deploy/lan/agentstudio-lan-deploy.py").read_text()
        self.assertIn("backend_or_worker_change_requires_operator_review", doc)
        self.assertIn("bootstrap_secret_must_remain_revoked", doc)
        self.assertIn("verify_migration_compatibility", doc)
        self.assertNotIn("DROP DATABASE", doc)
        self.assertNotIn("sudo -n", doc)

    def test_auto_timer_disabled_unless_explicit_root_marker(self):
        marker = self.path / "enable"
        with patch.object(PULL, "GATE", marker):
            self.assertFalse(PULL.auto_enabled())
            marker.write_text("AUTO_FRONTEND_ONLY\n")
            marker.chmod(0o600)
            # uid is platform-specific; default is checked in Linux on target.
            if hasattr(os, "geteuid") and os.geteuid() == 0:
                self.assertTrue(PULL.auto_enabled())
            marker.write_text("enable-production\n")
            with self.assertRaises(PULL.PullBlocked):
                PULL.auto_enabled()


    def test_tls_health_uses_real_lan_ip_and_verified_ca_not_loopback_or_insecure(self):
        calls = []
        def fake_urlopen(url, timeout=5):
            class Response:
                status = 200
                def __enter__(self):
                    return self
                def __exit__(self, *_args):
                    return False
            if url.endswith("/api/studio/bootstrap/status"):
                class Status(Response):
                    def read(self, *_args):
                        return b'{"initialized":true,"can_setup":false}'
                return Status()
            return Response()
        def fake_check_output(argv, timeout=21):
            calls.append(argv)
            uri = argv[-1]
            return b"401" if uri.endswith("/api/studio/me") else b"403" if uri.endswith("/__pb/_/") else b"200"
        with patch.object(LAN, "urlopen", side_effect=fake_urlopen), \
             patch.object(LAN, "sudo"), \
             patch.object(LAN.subprocess, "check_output", side_effect=fake_check_output):
            LAN.await_healthy()
        self.assertEqual(len(calls), 4)
        for argv in calls:
            self.assertIn("--cacert", argv)
            self.assertNotIn("-k", argv)
            self.assertNotIn("--insecure", argv)
            self.assertNotIn("--resolve", argv)
            self.assertTrue(argv[-1].startswith("https://192.168.1.133:8443/"))

    def test_insufficient_disk_blocks_before_worker_or_database_stop(self):
        base = self.path / "app"
        incoming = base / "incoming"
        incoming.mkdir(parents=True)
        releases = base / "releases"
        releases.mkdir()
        archive = incoming / (SHA_A + ".tar.gz")
        archive.write_bytes(b"synthetic-nonempty-file")
        (incoming / (SHA_A + ".sha256")).write_text(
            hashlib.sha256(archive.read_bytes()).hexdigest())
        data = self.path / "pb_data"
        data.mkdir()
        (data / "data.db").write_bytes(b"synthetic-nonempty-file")
        backup = self.path / "backups"
        backup.mkdir()
        calls = []
        with patch.object(LAN, "BASE", base), \
             patch.object(LAN, "DATA", data / "data.db"), \
             patch.object(LAN, "BACKUPS", backup), \
             patch.object(LAN, "require_runtime"), \
             patch.object(LAN, "get_previous", return_value=SHA_B), \
             patch.object(LAN, "extract_checked"), \
             patch.object(LAN, "verify_migration_compatibility"), \
             patch.object(LAN, "changed_runtime", return_value=[]), \
             patch.object(LAN, "changed_application", return_value=["dist/index.html"]), \
             patch.object(LAN, "sudo", side_effect=lambda *argv: calls.append(argv)), \
             patch.object(LAN.shutil, "disk_usage", return_value=SimpleNamespace(free=0)):
            with self.assertRaisesRegex(LAN.DeploymentRefused, "insufficient_disk"):
                LAN.deploy(SHA_A)
        self.assertFalse(any(len(args) > 1 and args[1] == "stop" for args in calls))

    def test_error_after_switch_restores_previous_code_and_services(self):
        base = self.path / "app"
        incoming = base / "incoming"
        incoming.mkdir(parents=True)
        (base / "releases").mkdir()
        archive = incoming / (SHA_A + ".tar.gz")
        archive.write_bytes(b"synthetic-release")
        (incoming / (SHA_A + ".sha256")).write_text(
            hashlib.sha256(archive.read_bytes()).hexdigest())
        data = self.path / "pb_data"
        data.mkdir()
        (data / "data.db").write_bytes(b"x")
        backup = self.path / "backups"
        backup.mkdir()
        active = [SHA_B]
        services = []
        def switch(sha):
            active[0] = sha
        count = [0]
        def unhealthy_once():
            count[0] += 1
            if count[0] == 1:
                raise LAN.DeploymentRefused("synthetic_health_failure")
        with patch.object(LAN, "BASE", base), \
             patch.object(LAN, "DATA", data / "data.db"), \
             patch.object(LAN, "BACKUPS", backup), \
             patch.object(LAN, "require_runtime"), \
             patch.object(LAN, "get_previous", side_effect=lambda: active[0]), \
             patch.object(LAN, "extract_checked"), \
             patch.object(LAN, "verify_migration_compatibility"), \
             patch.object(LAN, "changed_runtime", return_value=[]), \
             patch.object(LAN, "changed_application", return_value=["dist/index.html"]), \
             patch.object(LAN, "switch_to", side_effect=switch), \
             patch.object(LAN, "sqlite_backup", return_value=backup), \
             patch.object(LAN.shutil, "disk_usage", return_value=SimpleNamespace(free=2**33)), \
             patch.object(LAN, "sudo", side_effect=lambda *argv: services.append(argv)), \
             patch.object(LAN, "await_healthy", side_effect=unhealthy_once):
            with self.assertRaisesRegex(LAN.DeploymentRefused, "synthetic_health_failure"):
                LAN.deploy(SHA_A)
        self.assertEqual(active[0], SHA_B)
        self.assertEqual(count[0], 2)
        self.assertIn(("/usr/bin/systemctl", "stop", LAN.WORKER_SERVICE), services)
        self.assertIn(("/usr/bin/systemctl", "start", LAN.PB_SERVICE), services)
    def _verified_release(self, directory, commit, frontend=b"same frontend", worker=b"same worker"):
        contents = {
            "dist/index.html": frontend,
            "worker/run.mjs": worker,
            "package.json": b'{"type":"module"}',
            "src/lib/scheduleTime.js": b"export const x=1;",
        }
        directory.mkdir(parents=True, exist_ok=True)
        entries = []
        for name, value in contents.items():
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(value)
            entries.append({"path": name, "sha256": hashlib.sha256(value).hexdigest(),
                            "bytes": len(value)})
        (directory / "release-manifest.json").write_text(
            json.dumps({"schema": 1, "commit": commit, "files": entries}))
        return directory

    def _prepare_noop(self):
        base = self.path / "app"
        incoming = base / "incoming"
        incoming.mkdir(parents=True)
        releases = base / "releases"
        releases.mkdir()
        archive = incoming / (SHA_A + ".tar.gz")
        archive.write_bytes(b"synthetic-archive-candidate")
        (incoming / (SHA_A + ".sha256")).write_text(
            hashlib.sha256(archive.read_bytes()).hexdigest())
        self._verified_release(releases / SHA_B, SHA_B)
        return base, releases

    def test_noop_release_advances_only_version_pointer_without_restart_or_backup(self):
        base, releases = self._prepare_noop()
        active = [SHA_B]
        operations = []
        def extract(_, destination, commit):
            self._verified_release(destination, commit)
            return {"commit": commit, "files": 4}
        def switch(commit):
            operations.append(("switch", commit))
            active[0] = commit
        with patch.object(LAN, "BASE", base), \
             patch.object(LAN, "require_runtime"), \
             patch.object(LAN, "get_previous", return_value=SHA_B), \
             patch.object(LAN, "extract_checked", side_effect=extract), \
             patch.object(LAN, "switch_to", side_effect=switch), \
             patch.object(LAN, "sudo", side_effect=lambda *args: operations.append(args)), \
             patch.object(LAN, "await_healthy") as healthy, \
             patch.object(LAN, "sqlite_backup", side_effect=AssertionError("no backup for no-op")):
            LAN.deploy(SHA_A)
        self.assertEqual(active[0], SHA_A)
        self.assertEqual(healthy.call_count, 2)
        self.assertEqual([x for x in operations if x[0] == "switch"], [("switch", SHA_A)])
        self.assertFalse(any(len(x) > 1 and x[0].endswith("systemctl")
                             and x[1] in ("stop", "start", "restart") for x in operations))
        self.assertTrue((releases / SHA_A / "release-manifest.json").is_file())

    def test_noop_release_rolls_back_pointer_when_health_check_fails(self):
        base, _ = self._prepare_noop()
        active = [SHA_B]
        operations = []
        def extract(_, destination, commit):
            self._verified_release(destination, commit)
            return {"commit": commit, "files": 4}
        def switch(commit):
            active[0] = commit
            operations.append(("switch", commit))
        with patch.object(LAN, "BASE", base), \
             patch.object(LAN, "require_runtime"), \
             patch.object(LAN, "get_previous", return_value=SHA_B), \
             patch.object(LAN, "extract_checked", side_effect=extract), \
             patch.object(LAN, "switch_to", side_effect=switch), \
             patch.object(LAN, "sudo", side_effect=lambda *args: operations.append(args)), \
             patch.object(LAN, "await_healthy", side_effect=[
                 None, LAN.DeploymentRefused("synthetic_noop_health_failure")]), \
             patch.object(LAN, "sqlite_backup", side_effect=AssertionError("no backup for no-op")):
            with self.assertRaisesRegex(LAN.DeploymentRefused, "synthetic_noop_health_failure"):
                LAN.deploy(SHA_A)
        self.assertEqual(active[0], SHA_B)
        self.assertEqual([x for x in operations if x[0] == "switch"],
                         [("switch", SHA_A), ("switch", SHA_B)])
        self.assertFalse(any(len(x) > 1 and x[0].endswith("systemctl")
                             and x[1] in ("stop", "start", "restart") for x in operations))

    def test_same_manifest_requires_real_file_digest_match(self):
        prev = self._verified_release(self.path / "prev", SHA_B)
        newer = self._verified_release(self.path / "new", SHA_A)
        self.assertEqual(LAN.changed_application(prev, newer), [])
        self._verified_release(newer, SHA_A, frontend=b"new frontend")
        self.assertEqual(LAN.changed_application(prev, newer), ["dist/index.html"])
        (prev / "dist/index.html").write_bytes(b"tampered old frontend")
        with self.assertRaisesRegex(LAN.DeploymentRefused, "digest_mismatch|size_mismatch"):
            LAN.changed_application(prev, newer)


    def test_noop_release_rejects_unlisted_files_and_symlinks(self):
        prev = self._verified_release(self.path / "prev", SHA_B)
        newer = self._verified_release(self.path / "new", SHA_A)
        self.assertEqual(LAN.changed_application(prev, newer), [])
        (newer / "worker" / "untracked.pb.js").write_text("unaudited", encoding="utf8")
        with self.assertRaisesRegex(LAN.DeploymentRefused, "undeclared_file"):
            LAN.changed_application(prev, newer)
        (newer / "worker" / "untracked.pb.js").unlink()
        link = newer / "worker" / "link.mjs"
        try:
            link.symlink_to(newer / "worker" / "run.mjs")
        except OSError as exc:
            # Developer-mode symlink privileges are optional on Windows;
            # GitHub Linux CI exercises the real symlink assertion.
            if getattr(exc, "winerror", None) != 1314:
                raise
        else:
            with self.assertRaisesRegex(LAN.DeploymentRefused, "unexpected_symlink"):
                LAN.changed_application(prev, newer)
            link.unlink()
        (newer / "release-manifest.json").write_bytes(b"x" * (LAN.MAX_MANIFEST_BYTES + 1))
        with self.assertRaisesRegex(LAN.DeploymentRefused, "oversized"):
            LAN.changed_application(prev, newer)


    def test_builder_commands_drop_uid_gid_then_enable_no_new_privs(self):
        # Regression for Ubuntu systemd-run: runuser inside a root unit with
        # NoNewPrivileges=true failed with EPERM before pnpm/git could run.
        command = ["/usr/bin/git", "ls-remote", "--heads", "https://github.com/example/repo", "main"]
        with patch.object(PULL.subprocess, "run",
                          return_value=SimpleNamespace(stdout="OK\n")) as launch:
            response = PULL.subprocess_checked(command, as_builder=True,
                                               cwd=self.path, timeout=17)
        self.assertEqual(response, "OK")
        args = launch.call_args.args[0]
        self.assertEqual(args[0], "/usr/bin/setpriv")
        self.assertIn("--reuid=agentstudio-build", args)
        self.assertIn("--regid=agentstudio-build", args)
        self.assertIn("--init-groups", args)
        self.assertIn("--no-new-privs", args)
        self.assertIn("/usr/bin/env", args)
        index = args.index("/usr/bin/env")
        self.assertEqual(args[index + 1], "-i")
        self.assertIn("HOME=" + str(PULL.BUILD_HOME), args)
        self.assertIn("GIT_TERMINAL_PROMPT=0", args)
        self.assertEqual(args[-len(command):], command)
        self.assertNotIn("/usr/sbin/runuser", args)
        self.assertEqual(launch.call_args.kwargs["cwd"], self.path)
        self.assertEqual(launch.call_args.kwargs["timeout"], 17)

    def test_non_builder_commands_are_not_rewritten(self):
        command = ["/usr/bin/git", "version"]
        with patch.object(PULL.subprocess, "run",
                          return_value=SimpleNamespace(stdout="ok\n")) as proc:
            self.assertEqual(PULL.subprocess_checked(command), "ok")
        self.assertEqual(proc.call_args.args[0], command)


if __name__ == "__main__":
    unittest.main()

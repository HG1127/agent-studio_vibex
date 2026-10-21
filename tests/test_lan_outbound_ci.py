"""Offline security regression: do not contact user's LAN host or GitHub."""
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
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
    def test_pinned_api_disables_all_proxies_and_refuses_redirect(self):
        response = SimpleNamespace(status=200, read=lambda *_: b'{}')
        opener = SimpleNamespace(open=unittest.mock.MagicMock())
        opener.open.return_value.__enter__.return_value = response
        with patch.dict(os.environ, {"HTTP_PROXY": "http://invalid:1", "HTTPS_PROXY": "http://invalid:1",
                                     "ALL_PROXY": "http://invalid:1"}), \
             patch.object(CI, "build_opener", return_value=opener) as build:
            self.assertEqual(CI.api_json(CI.API + "/git/ref/heads/main", "synthetic"), {})
        self.assertEqual(build.call_args.args[0].proxies, {})
        self.assertIsInstance(build.call_args.args[1], CI.NoRedirect)
        with self.assertRaisesRegex(CI.CIGateBlocked, "redirect_forbidden"):
            CI.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.invalid")
        opener.open.side_effect = OSError("secret-token https://private.invalid")
        with patch.object(CI, "build_opener", return_value=opener):
            with self.assertRaises(CI.CIGateBlocked) as error:
                CI.api_json(CI.API + "/git/ref/heads/main", "secret-token")
        self.assertEqual(str(error.exception), "github_api_unavailable_or_invalid")

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

    def _git_proxy_stub(self, content=b"http://127.0.0.1:7890\n"):
        file = unittest.mock.MagicMock()
        file.is_symlink.return_value = False
        file.exists.return_value = True
        file.parent.is_symlink.return_value = False
        file.parent.stat.return_value = SimpleNamespace(
            st_mode=0o40700, st_uid=0, st_gid=0)
        file.stat.return_value = SimpleNamespace(
            st_mode=0o100600, st_uid=0, st_gid=0,
            st_nlink=1, st_size=len(content))
        file.read_bytes.return_value = content
        return file

    def test_git_proxy_is_optional_and_requires_root_private_file(self):
        stub = self._git_proxy_stub()
        with patch.object(PULL, "GIT_PROXY_FILE", stub):
            self.assertEqual(PULL.git_https_proxy(), "http://127.0.0.1:7890")
            stub.exists.return_value = False
            self.assertIsNone(PULL.git_https_proxy())
            stub.exists.return_value = True
            stub.is_symlink.return_value = True
            with self.assertRaisesRegex(PULL.PullBlocked, "symlink"):
                PULL.git_https_proxy()
            stub.is_symlink.return_value = False
            original = stub.stat.return_value
            for new in (
                SimpleNamespace(st_mode=0o100644, st_uid=0, st_gid=0,
                                st_nlink=1, st_size=original.st_size),
                SimpleNamespace(st_mode=0o100600, st_uid=1000, st_gid=0,
                                st_nlink=1, st_size=original.st_size),
                SimpleNamespace(st_mode=0o100600, st_uid=0, st_gid=0,
                                st_nlink=2, st_size=original.st_size),
            ):
                with self.subTest(properties=new):
                    stub.stat.return_value = new
                    with self.assertRaisesRegex(PULL.PullBlocked, "permissions"):
                        PULL.git_https_proxy()
            stub.stat.return_value = original
            stub.parent.stat.return_value = SimpleNamespace(
                st_mode=0o40777, st_uid=0, st_gid=0)
            with self.assertRaisesRegex(PULL.PullBlocked, "directory"):
                PULL.git_https_proxy()

    def test_git_proxy_rejects_credentials_malformed_urls_and_sensitive_errors(self):
        stub = self._git_proxy_stub()
        invalid = [
            b"http://user:pass@127.0.0.1:7890",
            b"http://127.0.0.1",
            b"http://127.0.0.1:notaport",
            b"file:///tmp/socket",
            b"http://127.0.0.1:7890/path",
            b"https://proxy.local:7890?secret=x",
            b"http://127.0.0.1:7890\nEVIL=1",
            b"http://127.0.0.1:7890\r\n",
            b"",
        ]
        with patch.object(PULL, "GIT_PROXY_FILE", stub):
            for raw in invalid:
                with self.subTest(raw=raw):
                    stub.read_bytes.return_value = raw
                    stub.stat.return_value.st_size = len(raw)
                    with self.assertRaises(PULL.PullBlocked) as error:
                        PULL.git_https_proxy()
                    self.assertNotIn("user:pass", str(error.exception))
                    self.assertNotIn("secret=", str(error.exception))
            stub.stat.return_value.st_size = 24
            stub.read_bytes.side_effect = OSError("secret-value from /etc")
            with self.assertRaisesRegex(PULL.PullBlocked, "configuration_invalid") as error:
                PULL.git_https_proxy()
            self.assertNotIn("secret-value", str(error.exception))

    def test_git_proxy_reaches_git_only_not_pnpm_node_or_regular_commands(self):
        calls = []
        def fake_run(argv, **_kwargs):
            calls.append(argv)
            return SimpleNamespace(stdout="ok")
        with patch.object(PULL, "git_https_proxy", return_value="http://127.0.0.1:7890") as proxy, \
             patch.object(PULL.subprocess, "run", side_effect=fake_run):
            PULL.subprocess_checked(["/usr/bin/git", "clone", "--depth", "1"],
                                    as_builder=True, phase="git_clone")
            PULL.subprocess_checked(["/usr/bin/git", "fetch", "origin", SHA_A],
                                    as_builder=True)
            PULL.subprocess_checked([str(PULL.BINARY), "install", "--frozen-lockfile"],
                                    as_builder=True, phase="pnpm_install")
            PULL.subprocess_checked([PULL.NODE, "deploy/lan/build-lan-bundle.mjs"],
                                    as_builder=True)
            PULL.subprocess_checked(["/usr/bin/git", "rev-parse", "HEAD"],
                                    as_builder=False)
        self.assertEqual(proxy.call_count, 2)
        for argv in calls[:2]:
            self.assertIn("/usr/bin/env", argv)
            self.assertIn("-i", argv)
            self.assertIn("HTTPS_PROXY=http://127.0.0.1:7890", argv)
            self.assertIn("https_proxy=http://127.0.0.1:7890", argv)
            self.assertIn("GIT_CONFIG_KEY_0=http.version", argv)
            self.assertIn("GIT_CONFIG_VALUE_0=HTTP/1.1", argv)
            self.assertNotIn("GIT_SSL_NO_VERIFY=1", argv)
        for argv in calls[2:]:
            self.assertFalse(any(x.startswith(("HTTPS_PROXY=", "https_proxy=",
                                               "GIT_CONFIG_COUNT=")) for x in argv))
        self.assertEqual(calls[-1], ["/usr/bin/git", "rev-parse", "HEAD"])

    def idle_db(self):
        data = self.path / "idle.db"
        with closing(sqlite3.connect(data)) as db:
            for sql in [
                "CREATE TABLE agent_runs (id TEXT, status TEXT)",
                "CREATE TABLE workflow_runs (id TEXT, status TEXT)",
                "CREATE TABLE agent_studio_run_leases (expires_ms INTEGER)",
                "CREATE TABLE agent_studio_side_effects (status TEXT)",
                "CREATE TABLE agent_studio_schedule_occurrences (status TEXT, locked_until_ms INTEGER)",
                "CREATE TABLE agent_studio_kb_embedding_queue (lease_until_ms INTEGER)",
                "CREATE TABLE agent_studio_schedules (deleted INTEGER, enabled INTEGER, next_at_ms INTEGER)",
            ]:
                db.execute(sql)
        return data

    def test_readonly_idle_check_blocks_active_pending_unknown_and_missing_schema(self):
        data = self.idle_db()
        with patch.object(LAN, "DATA", data):
            initial = LAN.idle_snapshot()
            cases = [
                ("agent_runs", "INSERT INTO agent_runs VALUES ('1','running')"),
                ("workflow_runs", "INSERT INTO workflow_runs VALUES ('1','paused')"),
                ("agent_runs", "INSERT INTO agent_runs VALUES ('1','future_status')"),
                ("agent_studio_run_leases", "INSERT INTO agent_studio_run_leases VALUES (9999999999999)"),
                ("agent_studio_side_effects", "INSERT INTO agent_studio_side_effects VALUES ('unknown')"),
                ("agent_studio_schedule_occurrences", "INSERT INTO agent_studio_schedule_occurrences VALUES ('pending',0)"),
                ("agent_studio_schedule_occurrences", "INSERT INTO agent_studio_schedule_occurrences VALUES ('started',9999999999999)"),
                ("agent_studio_kb_embedding_queue", "INSERT INTO agent_studio_kb_embedding_queue VALUES (0)"),
                ("agent_studio_schedules", "INSERT INTO agent_studio_schedules VALUES (0,1,0)"),
            ]
            for table, sql in cases:
                with self.subTest(table=table, sql=sql):
                    with closing(sqlite3.connect(data)) as db:
                        db.execute(sql)
                        db.commit()
                    before = data.read_bytes()
                    with self.assertRaisesRegex(LAN.DeploymentRefused, "active_or_pending"):
                        LAN.idle_snapshot()
                    self.assertEqual(data.read_bytes(), before)
                    with closing(sqlite3.connect(data)) as db:
                        db.execute("DELETE FROM " + table)
                        db.commit()
            self.assertEqual(initial, LAN.idle_snapshot())
            with closing(sqlite3.connect(data)) as db:
                db.execute("INSERT INTO agent_runs VALUES ('1','succeeded')")
                db.commit()
            self.assertNotEqual(initial, LAN.idle_snapshot())
            with closing(sqlite3.connect(data)) as db:
                db.execute("DROP TABLE agent_studio_side_effects")
            with self.assertRaisesRegex(LAN.DeploymentRefused, "schema_or_read_failed"):
                LAN.idle_snapshot()

    def test_auto_policy_exact_modes_owner_group_and_0600(self):
        marker = unittest.mock.MagicMock()
        marker.is_file.return_value = True
        marker.is_symlink.return_value = False
        marker.stat.return_value = SimpleNamespace(st_uid=0, st_gid=0, st_mode=0o100600)
        with patch.object(PULL, "GATE", marker):
            for mode in ("AUTO_FRONTEND_ONLY", "AUTO_CI_VERIFIED_RUNTIME"):
                marker.read_text.return_value = mode + "\n"
                self.assertEqual(PULL.auto_policy(), mode)
            marker.read_text.return_value = "UNKNOWN"
            with self.assertRaises(PULL.PullBlocked):
                PULL.auto_policy()
            for uid, gid, mode in ((1,0,0o600), (0,1,0o600), (0,0,0o640), (0,0,0o400), (0,0,0o4600)):
                marker.stat.return_value = SimpleNamespace(st_uid=uid, st_gid=gid, st_mode=mode)
                with self.assertRaisesRegex(PULL.PullBlocked, "permissions_invalid"):
                    PULL.auto_policy()

    def test_auto_main_rechecks_ci_policy_and_passes_explicit_runtime_permission(self):
        for policy in ("AUTO_FRONTEND_ONLY", "AUTO_CI_VERIFIED_RUNTIME"):
            ci = SimpleNamespace(confirmed_head=unittest.mock.MagicMock(return_value=(SHA_A, 6001)))
            lan = SimpleNamespace(deploy=unittest.mock.MagicMock())
            locks = SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=unittest.mock.MagicMock())
            with patch.object(PULL, "BASE", self.path), \
                 patch.object(PULL, "controller_modules", return_value=(ci, lan)), \
                 patch.object(PULL, "auto_policy", return_value=policy), \
                 patch.object(PULL, "release_sha", return_value=SHA_B), \
                 patch.object(PULL, "validate_paths"), \
                 patch.object(PULL, "stage_release") as stage, \
                 patch.object(sys, "argv", ["pull-update.py", "--auto"]), \
                 patch.dict(sys.modules, {"fcntl": locks}):
                self.assertEqual(PULL.main(), 0)
            stage.assert_called_once_with(SHA_A, lan, auto_previous=SHA_B)
            self.assertEqual(ci.confirmed_head.call_count, 2)
            lan.deploy.assert_called_once_with(SHA_A, reviewed_runtime=False,
                auto_runtime=policy == "AUTO_CI_VERIFIED_RUNTIME", automatic=True)
            locks.flock.assert_called_once()

    def test_final_check_requires_both_writers_dead_and_control_group(self):
        good = "ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nKillMode=control-group\n"
        with patch.object(LAN.subprocess, "check_output", return_value=good) as show:
            LAN.verify_stopped()
        self.assertEqual(show.call_count, 2)
        for bad in (good.replace("inactive", "active"), good.replace("MainPID=0", "MainPID=123"),
                    good.replace("control-group", "process"), ""):
            with patch.object(LAN.subprocess, "check_output", return_value=bad):
                with self.assertRaisesRegex(LAN.DeploymentRefused, "writers_not_fully_stopped"):
                    LAN.verify_stopped()

    def test_auto_diff_blocks_trust_and_schema_but_allows_worker(self):
        for name in ("deploy/lan/ci-gate.py", ".github/workflows/agent-studio-quality.yml",
                     "package.json", "pocketbase/pb_migrations/new.js", "ops/init.mjs",
                     "pocketbase/pb_hooks/modules/runtime_schema.js", "pocketbase/pb_hooks/auth.pb.js"):
            with patch.object(PULL, "subprocess_checked", side_effect=["", name + "\0"]):
                with self.assertRaises(PULL.PullBlocked):
                    PULL.verify_auto_changes(self.path, SHA_B, SHA_A)
        with patch.object(PULL, "subprocess_checked", side_effect=["", "worker/run.mjs\0", ""]):
            PULL.verify_auto_changes(self.path, SHA_B, SHA_A)
        with patch.object(PULL, "subprocess_checked", side_effect=["", "pocketbase/pb_hooks/feature.pb.js\0",
                                                                    '+  "ALTER TABLE x"']):
            with self.assertRaisesRegex(PULL.PullBlocked, "hook_schema_change"):
                PULL.verify_auto_changes(self.path, SHA_B, SHA_A)

    def test_automatic_deployment_runtime_migration_and_final_quiescence_gates(self):
        from contextlib import ExitStack
        for case in ("frontend_policy", "migration", "busy", "stop_race", "healthy", "rollback", "interrupted"):
            with self.subTest(case=case), ExitStack() as stack:
                base = self.path / case
                incoming = base / "incoming"
                incoming.mkdir(parents=True)
                (base / "releases").mkdir()
                archive = incoming / (SHA_A + ".tar.gz")
                archive.write_bytes(b"synthetic")
                (incoming / (SHA_A + ".sha256")).write_text(hashlib.sha256(b"synthetic").hexdigest())
                calls = []
                active = [SHA_B]
                stack.enter_context(patch.object(LAN, "BASE", base))
                stack.enter_context(patch.object(LAN, "DATA", self.path / "idle.db"))
                stack.enter_context(patch.object(LAN, "require_runtime"))
                stack.enter_context(patch.object(LAN, "get_previous", return_value=SHA_B))
                def extract(_, destination, commit):
                    destination.mkdir()
                stack.enter_context(patch.object(LAN, "extract_checked", side_effect=extract))
                migration = stack.enter_context(patch.object(LAN, "verify_migration_compatibility"))
                if case == "migration":
                    migration.side_effect = LAN.DeploymentRefused("migration_changed")
                stack.enter_context(patch.object(LAN, "changed_runtime", return_value=["worker/run.mjs"]))
                stack.enter_context(patch.object(LAN, "changed_application", return_value=["worker/run.mjs"]))
                stack.enter_context(patch.object(LAN.shutil, "disk_usage", return_value=SimpleNamespace(free=2**40)))
                idle = stack.enter_context(patch.object(LAN, "idle_snapshot", return_value="stable"))
                if case == "busy":
                    idle.side_effect = LAN.DeploymentRefused("active_work")
                elif case == "stop_race":
                    idle.side_effect = ["stable", "changed"]
                stack.enter_context(patch.object(LAN, "sudo", side_effect=lambda *args: calls.append(args)))
                stack.enter_context(patch.object(LAN, "verify_stopped"))
                backup = stack.enter_context(patch.object(LAN, "sqlite_backup", return_value=self.path))
                def switch(commit):
                    active[0] = commit
                stack.enter_context(patch.object(LAN, "switch_to", side_effect=switch))
                healthy = stack.enter_context(patch.object(LAN, "await_healthy"))
                if case in ("rollback", "interrupted"):
                    healthy.side_effect = [LAN.DeploymentRefused(
                        "update_interrupted_requires_operator_review" if case == "interrupted" else "health_failure"), None]
                if case == "healthy":
                    LAN.deploy(SHA_A, auto_runtime=True)
                    self.assertEqual(active[0], SHA_A)
                    backup.assert_called_once()
                    self.assertEqual(idle.call_count, 2)
                else:
                    with self.assertRaises(LAN.DeploymentRefused):
                        LAN.deploy(SHA_A, auto_runtime=case != "frontend_policy", automatic=True)
                    self.assertEqual(active[0], SHA_B)
                    if case in ("frontend_policy", "migration", "busy"):
                        self.assertFalse(any("stop" in c for c in calls))
                    if case == "stop_race":
                        backup.assert_not_called()
                        self.assertEqual(healthy.call_count, 1)
                    if case in ("rollback", "interrupted"):
                        backup.assert_called_once()
                        self.assertEqual(healthy.call_count, 2)

    def test_sigterm_handlers_enter_failure_path(self):
        with self.assertRaisesRegex(PULL.PullBlocked, "update_interrupted"):
            PULL.interrupt_update(15, None)
        with self.assertRaisesRegex(LAN.DeploymentRefused, "update_interrupted"):
            LAN.interrupt_update(15, None)

    def test_extract_under_umask_077_has_all_directories_traversable(self):
        source = self._verified_release(self.path / "source", SHA_A)
        deep = source / "dist/assets/deep"
        deep.mkdir(parents=True)
        (deep / "empty").mkdir()
        # Include nested directories without relying on explicit tar entries.
        raw = b"asset"
        (deep / "x.js").write_bytes(raw)
        manifest_file = source / "release-manifest.json"
        doc = json.loads(manifest_file.read_text())
        doc["files"].append({"path":"dist/assets/deep/x.js", "sha256":hashlib.sha256(raw).hexdigest(), "bytes":len(raw)})
        manifest_file.write_text(json.dumps(doc))
        archive = self.path / "code.tar.gz"
        with tarfile.open(archive, "w:gz") as out:
            for file in source.rglob("*"):
                if file.is_file():
                    out.add(file, arcname=file.relative_to(source).as_posix())
        old = os.umask(0o077)
        destination = self.path / "unpacked"
        try:
            LAN.extract_checked(archive, destination, SHA_A)
        finally:
            os.umask(old)
        if os.name != "nt":
            for file in [destination, *destination.rglob("*")]:
                self.assertEqual(file.stat().st_mode & 0o777, 0o755 if file.is_dir() else 0o644)

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
        config = self.path / "studio.env"
        config.write_text("SYNTHETIC_CONFIG=1")
        units = self.path / "units"
        units.mkdir()
        # Patch the fixed config sources; never read real machine credentials.
        for name in (LAN.PB_SERVICE, LAN.WORKER_SERVICE):
            (units / name).write_text("synthetic unit")
        real_copy = LAN.shutil.copyfile
        def copy_config(source, target, **kwargs):
            if Path(source).name in (LAN.PB_SERVICE, LAN.WORKER_SERVICE):
                source = units / Path(source).name
            return real_copy(source, target, **kwargs)
        with patch.object(LAN, "DATA", live / "data.db"), patch.object(LAN, "BACKUPS", backup_root), \
             patch.object(LAN, "ENV_FILE", config), patch.object(LAN, "CA_CERT", config), \
             patch.object(LAN, "NGINX_SITE", config), patch.object(LAN, "get_previous", return_value=SHA_B), \
             patch.object(LAN.shutil, "copyfile", side_effect=copy_config):
            backup = LAN.sqlite_backup(SHA_A)
        self.assertEqual((backup / "config/0-studio.env").read_text(), "SYNTHETIC_CONFIG=1")
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

    def test_auto_stage_rejects_partial_invalid_and_symlinked_release_artifacts(self):
        incoming = self.path / "auto-incoming"
        incoming.mkdir()
        archive = incoming / (SHA_A + ".tar.gz")
        checksum = incoming / (SHA_A + ".sha256")
        with patch.object(PULL, "INCOMING", incoming):
            archive.write_bytes(b"previous-manual-stage")
            with self.assertRaisesRegex(PULL.PullBlocked, "artifact_collision"):
                PULL.stage_release(SHA_A, LAN, auto_previous=SHA_B)
            checksum.write_text("0" * 64)
            with self.assertRaisesRegex(PULL.PullBlocked, "checksum_mismatch"):
                PULL.stage_release(SHA_A, LAN, auto_previous=SHA_B)
            checksum.unlink()
            secret = self.path / "do-not-touch"
            secret.write_text("original")
            try:
                checksum.symlink_to(secret)
            except (OSError, NotImplementedError):
                self.skipTest("OS does not allow test symlinks")
            with self.assertRaisesRegex(PULL.PullBlocked, "artifact_collision"):
                PULL.stage_release(SHA_A, LAN, auto_previous=SHA_B)
            self.assertEqual(secret.read_text(), "original")

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
                 None, LAN.DeploymentRefused("synthetic_noop_health_failure"), None]), \
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


    def test_stage_diagnostics_report_phase_without_leaking_stderr(self):
        from contextlib import redirect_stdout
        fake = subprocess.CalledProcessError(
            128, ["git", "clone", "https://token:private@example.test"],
            stderr="Authorization Bearer very-private-token",
            output="secret-workflow-request",
        )
        output = io.StringIO()
        with patch.object(PULL.subprocess, "run", side_effect=fake):
            with redirect_stdout(output):
                with self.assertRaisesRegex(PULL.PullBlocked, "stage_git_clone_exit_128"):
                    PULL.subprocess_checked(
                        ["/usr/bin/git", "clone", "fake-source"], phase="git_clone",
                        as_builder=True,
                    )
        self.assertIn("LAN_STAGE_BEGIN:git_clone", output.getvalue())
        self.assertNotIn("private", output.getvalue())
        self.assertNotIn("token", output.getvalue())
        self.assertNotIn("Bearer", output.getvalue())

    def test_stage_diagnostics_identify_timeout_and_success(self):
        from contextlib import redirect_stdout
        output = io.StringIO()
        with patch.object(PULL.subprocess, "run", side_effect=subprocess.TimeoutExpired(
                ["/usr/bin/git", "clone"], timeout=5)):
            with redirect_stdout(output):
                with self.assertRaisesRegex(PULL.PullBlocked, "stage_git_clone_timeout"):
                    PULL.subprocess_checked(["/usr/bin/git", "clone"], phase="git_clone")
        self.assertIn("LAN_STAGE_BEGIN:git_clone", output.getvalue())
        self.assertNotIn("LAN_STAGE_OK:git_clone", output.getvalue())

        output = io.StringIO()
        with patch.object(PULL.subprocess, "run",
                          return_value=SimpleNamespace(stdout="ok\n")):
            with redirect_stdout(output):
                self.assertEqual(PULL.subprocess_checked(
                    ["/usr/bin/node", "-v"], phase="frontend_build"), "ok")
        self.assertEqual(
            output.getvalue().splitlines(),
            ["LAN_STAGE_BEGIN:frontend_build", "LAN_STAGE_OK:frontend_build"],
        )

    def test_stage_diagnostics_reject_untrusted_phase_strings(self):
        with patch.object(PULL.subprocess, "run") as runner:
            with self.assertRaisesRegex(PULL.PullBlocked, "invalid_stage_diagnostic_phase"):
                PULL.subprocess_checked(["false"], phase="--secret_api_token")
        runner.assert_not_called()


if __name__ == "__main__":
    unittest.main()

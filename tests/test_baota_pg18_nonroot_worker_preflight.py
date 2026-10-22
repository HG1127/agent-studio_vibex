from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import patch

FILE = (Path(__file__).resolve().parent.parent / "ops" /
        "baota-pg18-nonroot-worker-preflight.py")
spec = importlib.util.spec_from_file_location("pg18_nonroot", FILE)
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


def sample(kind, *, running=False):
    return {
        "mode": "preflight", "worker": kind, "target": "agent_studio",
        "database_port": 5333, "verified_roles": True,
        "db_writes_performed": False,
        "worker_started": running,
        "external_model_calls": False,
        "production_cutover_allowed": False,
    }


class Pg18NonrootWorkerPreflightTests(unittest.TestCase):
    def test_only_explicit_modes_and_approval(self):
        for args in ([], ["--run"], ["--serve"],
                     ["--run", "--other"], ["--plan", "--run"]):
            with self.assertRaises(SystemExit):
                app.main(args)

    def test_transient_commands_are_nonroot_oneshot_readonly_and_exact_target(self):
        for kind in ("prepare", "model"):
            argv = app.transient_args(kind)
            joined = " ".join(argv)
            self.assertEqual(argv[0], "/usr/bin/systemd-run")
            self.assertIn("--wait", argv)
            self.assertIn("--collect", argv)
            self.assertIn("--pipe", argv)
            self.assertIn("--unit=agentstudio-pg18-" + kind + ".service", argv)
            self.assertIn("--property=User=agentstudio-pg18-" + kind, argv)
            self.assertIn("--property=DynamicUser=yes", argv)
            self.assertIn("--property=Type=oneshot", argv)
            self.assertIn("--property=ProtectHome=yes", argv)
            self.assertIn("--property=ProtectSystem=strict", argv)
            self.assertIn("--property=IPAddressDeny=any", argv)
            self.assertIn("--property=IPAddressAllow=127.0.0.0/8", argv)
            self.assertIn("--property=NoNewPrivileges=yes", argv)
            self.assertIn("--property=LoadCredential=worker.secret:" +
                          str(app.SECRET), argv)
            self.assertIn("AGENT_STUDIO_PG_WORKER_PASSWORD_FILE=%d/worker.secret",
                          joined)
            self.assertIn("AGENT_STUDIO_PG_DATABASE=agent_studio", joined)
            self.assertIn("AGENT_STUDIO_PG_PORT=5333", joined)
            self.assertIn("AGENT_STUDIO_PG_HOST=127.0.0.1", joined)
            self.assertEqual(argv[-1], "--preflight")
            self.assertNotIn("--serve", joined)
            self.assertNotIn("PGPASSWORD=", joined)
            self.assertNotIn("OPENAI_API_KEY", joined)
            self.assertNotIn("AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED",
                             joined)

    def test_plan_never_reads_secret_or_runs_transient_service(self):
        with ExitStack() as stack:
            for name in ("manifest_ok", "source_tree_traversable", "pg_driver_ok",
                         "private_secret", "old_services_active", "unit_is_clear",
                         "trusted_dir", "trusted_file", "node24_ready"):
                stack.enter_context(patch.object(app, name, return_value=True))
            stack.enter_context(patch.object(app, "link_state", return_value="absent"))
            stack.enter_context(patch.object(app.Path, "is_file", return_value=True))
            stack.enter_context(patch.object(app.os, "access", return_value=True))
            stack.enter_context(patch.object(app.sys, "platform", "linux"))
            stack.enter_context(patch.object(app.os, "geteuid", return_value=0, create=True))
            linked = stack.enter_context(patch.object(app, "install_driver_link"))
            report = app.plan()
        self.assertTrue(report["ready_for_nonroot_preflight"])
        self.assertFalse(report["secret_contents_accessed"])
        self.assertFalse(report["db_connected"])
        self.assertFalse(report["systemd_units_started"])
        self.assertFalse(report["worker_started"])
        self.assertFalse(report["production_cutover_allowed"])
        linked.assert_not_called()

    def test_manifest_verification_is_independent_of_terminal_directory(self):
        completed = subprocess.CompletedProcess([], 0, "all sha256 OK", "")
        with ExitStack() as stack:
            stack.enter_context(patch.object(app, "trusted_dir", return_value=True))
            stack.enter_context(patch.object(app, "trusted_file", return_value=True))
            runner = stack.enter_context(patch.object(
                app.subprocess, "run", return_value=completed))
            self.assertTrue(app.manifest_ok())
        self.assertEqual(runner.call_args.kwargs["cwd"], app.ROOT)
        self.assertEqual(runner.call_args.args[0][:2],
                         ["/usr/bin/sha256sum", "-c"])
        self.assertNotIn("PGPASSWORD", runner.call_args.kwargs["env"])

    def test_node_binary_must_be_root_owned_nonwritable_before_execution(self):
        with ExitStack() as stack:
            stack.enter_context(patch.object(app, "trusted_dir", return_value=False))
            runner = stack.enter_context(patch.object(app, "run_checked"))
            self.assertFalse(app.node24_ready())
        runner.assert_not_called()

    def test_windows_zip_permissions_require_scoped_linux_readability(self):
        # Windows-created ZIP files have been observed as 0600 on Linux.
        # The program must fail closed until the isolated checked sources
        # are root-owned and readable/traversable by the dynamic systemd UID.
        for mode, allowed in [(0o600, False), (0o644, True),
                              (0o666, False), (0o444, True)]:
            fake = SimpleNamespace(st_mode=stat.S_IFREG | mode, st_uid=0)
            with patch.object(app, "details", return_value=fake):
                self.assertIs(app.trusted_file(app.ROOT / "README_NONROOT_PREFLIGHT.txt"), allowed)
        for mode, allowed in [(0o700, False), (0o755, True), (0o777, False)]:
            fake = SimpleNamespace(st_mode=stat.S_IFDIR | mode, st_uid=0)
            with patch.object(app, "details", return_value=fake):
                self.assertIs(app.trusted_dir(app.ROOT), allowed)
        fake = SimpleNamespace(st_mode=stat.S_IFREG | 0o644, st_uid=1001)
        with patch.object(app, "details", return_value=fake):
            self.assertFalse(app.trusted_file(app.ROOT / "SHA256SUMS"))

    def test_driver_link_rejects_unrelated_existing_directory(self):
        with ExitStack() as stack:
            stack.enter_context(patch.object(app, "link_state", return_value="conflict"))
            linked = stack.enter_context(patch.object(app.Path, "symlink_to"))
            with self.assertRaises(SystemExit):
                app.install_driver_link()
        linked.assert_not_called()

    def test_full_success_requires_two_distinct_zero_task_results(self):
        events = []
        def fake_run(argv, **kwargs):
            events.append((argv, kwargs))
            if argv[1] == "-e":
                return subprocess.CompletedProcess(argv, 0, "", "")
            kind = "prepare" if "--unit=agentstudio-pg18-prepare.service" in argv else "model"
            return subprocess.CompletedProcess(argv, 0,
                json.dumps(sample(kind)) + "\n", "")
        with ExitStack() as stack:
            stack.enter_context(patch.object(app, "plan", return_value={
                 "ready_for_nonroot_preflight": True}))
            stack.enter_context(patch.object(app, "install_driver_link"))
            stack.enter_context(patch.object(app, "unit_is_clear", return_value=True))
            stack.enter_context(patch.object(app, "old_services_active", return_value=True))
            stack.enter_context(patch.object(app.subprocess, "run", side_effect=fake_run))
            report = app.run_preflight()
        self.assertEqual(len(events), 3)
        self.assertEqual([x["worker"] for x in report["tested"]],
                         ["prepare", "model"])
        self.assertTrue(report["nonroot_systemd_preflight_verified"])
        self.assertFalse(report["persistent_services_installed"])
        self.assertFalse(report["worker_started"])
        self.assertFalse(report["db_writes_performed"])
        self.assertFalse(report["production_cutover_allowed"])
        for argv, opts in events[1:]:
            self.assertNotIn("PGPASSWORD", opts["env"])
            self.assertNotIn("DATABASE_URL", opts["env"])
            self.assertNotIn("--serve", argv)
            self.assertEqual(argv[-1], "--preflight")

    def test_fails_closed_on_missing_evidence_and_does_not_run_second_worker(self):
        events = []
        def fake_run(argv, **kwargs):
            events.append(argv)
            return subprocess.CompletedProcess(argv, 0, "", "")
        with ExitStack() as stack:
            stack.enter_context(patch.object(app, "plan", return_value={
                 "ready_for_nonroot_preflight": True}))
            stack.enter_context(patch.object(app, "install_driver_link"))
            stack.enter_context(patch.object(app, "unit_is_clear", return_value=True))
            stack.enter_context(patch.object(app.subprocess, "run", side_effect=fake_run))
            with self.assertRaises(SystemExit) as issue:
                app.run_preflight()
        self.assertIn("transient_prepare_evidence_missing", str(issue.exception))
        # No model Worker is run when prepare evidence is missing.
        self.assertEqual(len(events), 2)

    def test_approved_transient_runs_never_query_production_or_start_model(self):
        source = FILE.read_text("utf8")
        self.assertNotIn("subprocess.run([\"systemctl\", \"stop\"", source)
        self.assertNotIn("--serve\"]", source)
        self.assertIn("old_pocketbase_services_active", source)
        self.assertIn("production_cutover_allowed", source)


if __name__ == "__main__":
    unittest.main()

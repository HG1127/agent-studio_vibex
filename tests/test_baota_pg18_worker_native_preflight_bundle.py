import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

FILE=Path(__file__).resolve().parent.parent/"ops"/"build-pg18-worker-native-preflight-bundle.py"
spec=importlib.util.spec_from_file_location("native_pg18_builder",FILE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Pg18NativeBundleTests(unittest.TestCase):
    def test_bundle_only_has_shared_readonly_and_two_safe_cli_wrappers(self):
        with tempfile.TemporaryDirectory(prefix="pg18-native-workers-") as d:
            data=mod.build(d)
            self.assertEqual(data["files"],13)
            self.assertTrue(data["manifest_verified"])
            self.assertTrue(data["two_readonly_wrappers"])
            self.assertFalse(data["previous_sources_overwritten"])
            self.assertFalse(data["credential_bytes_included"])
            self.assertFalse(data["task_worker_included"])
            self.assertFalse(data["model_provider_included"])
            self.assertFalse(data["database_connected"])
            self.assertFalse(data["production_modified"])
            self.assertFalse(data["production_cutover_allowed"])
            archive=Path(data["archive"])
            self.assertEqual(data["sha256"],hashlib.sha256(archive.read_bytes()).hexdigest())
            with zipfile.ZipFile(archive) as z:
                self.assertEqual(set(z.namelist()),set(mod.FILES)|{mod.MANIFEST,mod.README})
                self.assertTrue(all((item.external_attr>>16)&0o777 == 0o644
                                    for item in z.infolist()))
                lines=z.read(mod.MANIFEST).decode("ascii").splitlines()
                self.assertEqual(len(lines),12)
                for line in lines:
                    checksum,name=line.split("  ")
                    self.assertEqual(checksum,hashlib.sha256(z.read(name)).hexdigest())
                readme=z.read(mod.README).decode("utf8")
                self.assertIn("Prepare is checked FIRST",readme)
                self.assertIn("--plan",readme)
                self.assertIn("--preflight-both",readme)
                self.assertIn("NO-GO",readme)
                for forbidden in ("chmod -R","chown -R","systemctl stop"):
                    self.assertNotIn(forbidden,readme)

    def test_bundle_refuses_previous_zip_overwrite(self):
        with tempfile.TemporaryDirectory(prefix="pg18-native-workers-") as d:
            mod.build(d)
            with self.assertRaises(SystemExit):
                mod.build(d)

    def test_refuses_writing_under_git_checkout(self):
        with self.assertRaises(SystemExit):
            mod.build(mod.ROOT/"deliverables")

    def test_requires_explicit_output_path_and_no_serve(self):
        for a in ([],["--serve"],["--output-dir"],["--output-dir","relative"]):
            with self.assertRaises(SystemExit):
                mod.main(a)

if __name__=="__main__":
    unittest.main()

import importlib.util
from contextlib import ExitStack
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parent.parent

def load(name,rel):
    spec=importlib.util.spec_from_file_location(name,ROOT/rel)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

audit=load("pg18_native_preflight","ops/baota-pg18-worker-native-preflight-review.py")
acl=load("pg18_acl_operator","ops/baota-pg18-acl-credential-preflight.py")
fixed=load("pg18_fixed_credentials","ops/baota-pg18-fixed-credential-preflight.py")
stage=load("pg18_stage_operator","ops/baota-pg18-stage-probe-operator.py")
diag=load("pg18_previous_diagnostic","ops/baota-pg18-prepare-transient-diagnostic.py")
original=load("pg18_original_operator","ops/baota-pg18-nonroot-worker-preflight.py")
REVIEWED=(acl,fixed,stage,diag,original)


def prepare_old():
    args=fixed.fixed_argv(stage.approved_argv(diag,original),"prepare",original)
    args[-2]=str(acl.NEW_PROBE)
    return args

def synthetic(kind,*,passed=True,step="complete"):
    return json.dumps({
        "mode":"preflight","worker":kind,"stage":step,
        "status":"passed" if passed else "failed",
        "target":"agent_studio","database_port":5333,
        "verified_roles":bool(passed),
        "db_writes_performed":False,"worker_started":False,
        "external_model_calls":False,"production_cutover_allowed":False
    })+"\n"


class NativeWorkerReviewTests(unittest.TestCase):
    def test_exact_prepare_and_model_paths_preserve_original_systemd_sandbox(self):
        prepare=prepare_old()
        with patch.object(acl,"plan",return_value=({},prepare)):
            for kind in ("prepare","model"):
                command=audit.checked_command(kind,REVIEWED)
                previous=(prepare if kind=="prepare" else
                    fixed.fixed_argv(original.transient_args(kind),kind,original))
                self.assertEqual(len(previous),len(command))
                self.assertEqual([i for i,(a,b) in enumerate(zip(previous,command))
                                   if a!=b],[len(previous)-2])
                self.assertEqual(command[-1],"--preflight")
                self.assertEqual(command[-2],
                    str(audit.ROOT/"services/pg-api/src"/audit.NAME_MAP[kind]))
                self.assertIn("--unit=agentstudio-pg18-"+kind+".service",command)
                self.assertIn("--property=DynamicUser=yes",command)
                self.assertIn("--property=ProtectHome=yes",command)
                self.assertIn("--property=IPAddressDeny=any",command)
                self.assertIn("--property=IPAddressAllow=127.0.0.0/8",command)
                self.assertIn("--property=LoadCredential=worker.secret:"+
                              str(original.SECRET),command)
                self.assertIn(
                    "AGENT_STUDIO_PG_WORKER_PASSWORD_FILE=/run/credentials/"+
                    "agentstudio-pg18-"+kind+".service/worker.secret"," ".join(command))
                self.assertNotIn("--serve",command)

    def test_offline_plan_never_runs_new_transient_unit(self):
        with ExitStack() as ctx:
            ctx.enter_context(patch.object(original,"old_services_active",
                                           return_value=True))
            ctx.enter_context(patch.object(original,"unit_is_clear",
                                           return_value=True))
            def checked(kind,*unused):
                return ["/usr/bin/systemd-run","--preflight",kind]
            ctx.enter_context(patch.object(audit,"checked_command",side_effect=checked))
            subprocess_mock=ctx.enter_context(patch.object(audit.subprocess,"run"))
            report,commands=audit.plan(REVIEWED)
        subprocess_mock.assert_not_called()
        self.assertEqual(len(commands),2)
        self.assertTrue(report["ready_for_two_readonly_preflights"])
        self.assertFalse(report["transient_units_started"])
        self.assertFalse(report["credential_contents_accessed"])
        self.assertFalse(report["database_connected"])
        self.assertFalse(report["production_cutover_allowed"])

    def test_result_parser_requires_exact_complete_readonly_evidence(self):
        for kind in ("prepare","model"):
            self.assertTrue(audit.parse_preflight(synthetic(kind),kind))
            self.assertFalse(audit.parse_preflight(synthetic(kind)*2,kind))
            self.assertFalse(audit.parse_preflight(
                synthetic(kind).replace('"worker_started": false',
                                        '"worker_started": true'),kind))
            self.assertFalse(audit.parse_preflight(synthetic(kind,passed=False,step="secret_file"),kind))
            other="model" if kind=="prepare" else "prepare"
            self.assertFalse(audit.parse_preflight(synthetic(other),kind))

    def test_both_pass_once_and_never_print_credentials(self):
        p=["/usr/bin/systemd-run","--unit=agentstudio-pg18-prepare.service","--preflight"]
        m=["/usr/bin/systemd-run","--unit=agentstudio-pg18-model.service","--preflight"]
        order=[]
        def executor(args,**kwargs):
            order.append((args,kwargs))
            kind="prepare" if "prepare.service" in args[1] else "model"
            return subprocess.CompletedProcess(args,0,synthetic(kind),"secret=NEVER_PRINT")
        with ExitStack() as ctx:
            ctx.enter_context(patch.object(audit,"plan",
                                           return_value=({},[p,m])))
            ctx.enter_context(patch.object(original,"old_services_active",
                                           return_value=True))
            ctx.enter_context(patch.object(original,"unit_is_clear",
                                           return_value=True))
            ctx.enter_context(patch.object(audit.subprocess,"run",
                                           side_effect=executor))
            result=audit.preflight_both(REVIEWED)
        self.assertEqual(len(order),2)
        self.assertEqual(order[0][0],p)
        self.assertEqual(order[1][0],m)
        self.assertTrue(result["both_readonly_verified"])
        self.assertTrue(result["prepare_readonly_verified"])
        self.assertTrue(result["model_readonly_verified"])
        self.assertFalse(result["worker_task_loop_started"])
        self.assertFalse(result["model_provider_called"])
        self.assertFalse(result["production_cutover_allowed"])
        self.assertNotIn("NEVER_PRINT",json.dumps(result))
        for cmd,kwargs in order:
            self.assertNotIn("PGPASSWORD",kwargs["env"])
            self.assertNotIn("DATABASE_URL",kwargs["env"])
            self.assertNotIn("--serve",cmd)

    def test_prepare_failure_stops_before_model(self):
        commands=[["/usr/bin/systemd-run","prepare"],
                  ["/usr/bin/systemd-run","model"]]
        def prepare_fails(args,**kwargs):
            return subprocess.CompletedProcess(args,3,
                synthetic("prepare",passed=False,step="secret_file"),
                "password=NEVER_LOG")
        with ExitStack() as ctx:
            ctx.enter_context(patch.object(audit,"plan",
                                           return_value=({},commands)))
            ctx.enter_context(patch.object(original,"old_services_active",
                                           return_value=True))
            ctx.enter_context(patch.object(original,"unit_is_clear",
                                           return_value=True))
            calls=ctx.enter_context(patch.object(audit.subprocess,"run",
                                           side_effect=prepare_fails))
            outcome=audit.preflight_both(REVIEWED)
        self.assertEqual(calls.call_count,1)
        self.assertEqual(len(outcome["results"]),1)
        self.assertFalse(outcome["model_readonly_verified"])
        self.assertFalse(outcome["both_readonly_verified"])
        self.assertEqual(outcome["results"][0]["stage_code"],"secret_file")
        self.assertNotIn("NEVER_LOG",json.dumps(outcome))

    def test_model_failure_keeps_prepare_result_but_reports_no_final_success(self):
        p=["/usr/bin/systemd-run","prepare"]
        m=["/usr/bin/systemd-run","model"]
        def serve(args,**kwargs):
            if args==p:return subprocess.CompletedProcess(args,0,synthetic("prepare"),"")
            return subprocess.CompletedProcess(args,1,"","Failed to start transient service unit")
        with ExitStack() as ctx:
            ctx.enter_context(patch.object(audit,"plan",
                                           return_value=({},[p,m])))
            ctx.enter_context(patch.object(original,"old_services_active",
                                           return_value=True))
            ctx.enter_context(patch.object(original,"unit_is_clear",
                                           return_value=True))
            ctx.enter_context(patch.object(audit.subprocess,"run",side_effect=serve))
            result=audit.preflight_both(REVIEWED)
        self.assertEqual(len(result["results"]),2)
        self.assertTrue(result["prepare_readonly_verified"])
        self.assertFalse(result["model_readonly_verified"])
        self.assertFalse(result["both_readonly_verified"])
        self.assertEqual(result["results"][1]["stage_code"],"no_verified_preflight_json")

    def test_explicit_operator_approval_only(self):
        for args in ([],["--serve"],["--preflight-both"],["--plan","--serve"],
                     ["--preflight-both","--host=vcaios"]):
            with patch.object(audit,"checked_acl_operator") as source:
                with self.assertRaises(SystemExit):
                    audit.main(args)
                source.assert_not_called()

    def test_manifest_mismatch_blocks_before_importing_previous_operator(self):
        with ExitStack() as ctx:
            ctx.enter_context(patch.object(audit,"private_source",return_value=True))
            ctx.enter_context(patch.object(audit.subprocess,"run",
                return_value=subprocess.CompletedProcess([],1,"","")))
            spec=ctx.enter_context(patch.object(audit.importlib.util,
                                                "spec_from_file_location"))
            with self.assertRaises(SystemExit):
                audit.checked_acl_operator()
            spec.assert_not_called()


if __name__=="__main__":
    unittest.main()

#!/usr/bin/env python3
"""Review both PG18 Worker read-only CLI paths through protected transient units.

Calls the same shared PG18 preflight function used by real Prepare/Model
Worker CLI modes, packaged behind preflight-only wrappers. No --serve,
task engines, model providers, queue claims, DML, or production changes.

--plan is offline, checks ALL previous SHA manifests and two new wrappers.
--preflight-both --approve-two-readonly-oneshots runs PREPARE then MODEL,
and fails closed before MODEL if PREPARE fails.
"""
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys

ROOT = Path("/opt/agentstudio-pg18-worker-preflight-v1")
PACKAGE = ROOT/"ops/baota-pg18-worker-native-preflight-review.py"
NEW_MANIFEST = "SHA256SUMS_NATIVE_WORKER_PREFLIGHT"
ACL_OPERATOR = ROOT/"ops/baota-pg18-acl-credential-preflight.py"
SOURCES = (
    ROOT/"services/pg-api/src/pg18-native-worker-readonly.ts",
    ROOT/"services/pg-api/src/pg18-prepare-readonly-preflight.ts",
    ROOT/"services/pg-api/src/pg18-model-readonly-preflight.ts",
    ROOT/"services/pg-api/src/optional-credential-boundary.ts",
    ROOT/"services/pg-api/src/knowledge-content-privileges.ts",
    ROOT/"services/pg-api/src/knowledge-embedding-privileges.ts",
    ROOT/"services/pg-api/src/knowledge-index-audit.ts",
    ROOT/"services/pg-api/src/knowledge-sharing-policy.ts",
    PACKAGE,
)
NAME_MAP = {
    "prepare": "pg18-prepare-readonly-preflight.ts",
    "model": "pg18-model-readonly-preflight.ts",
}


def refuse(reason):
    raise SystemExit("PG18_NATIVE_WORKER_PREFLIGHT_REFUSED:"+reason)


def private_source(path):
    try:
        value=path.lstat()
    except OSError:
        return False
    return bool(stat.S_ISREG(value.st_mode) and value.st_uid==0
                and value.st_mode&0o022==0 and value.st_mode&0o004!=0)


def checked_acl_operator():
    if not all(private_source(x) for x in (
        *SOURCES, ROOT/NEW_MANIFEST, ACL_OPERATOR,
        ROOT/"SHA256SUMS_ACL_CREDENTIAL_PROBE"
    )):
        refuse("audited_source_permissions_invalid")
    for manifest in (NEW_MANIFEST, "SHA256SUMS_ACL_CREDENTIAL_PROBE"):
        try:
            result=subprocess.run(
                ["/usr/bin/sha256sum","-c",manifest],
                cwd=ROOT,capture_output=True,text=True,timeout=25,
                check=False,stdin=subprocess.DEVNULL,
                env={"PATH":"/usr/bin:/bin","LANG":"C"})
        except (OSError,subprocess.TimeoutExpired):
            refuse("manifest_verifier_unavailable")
        if result.returncode!=0:
            refuse("manifest_mismatch:"+manifest)
    spec=importlib.util.spec_from_file_location("pg18_pinned_acl_operator",ACL_OPERATOR)
    if not spec or not spec.loader:
        refuse("acl_operator_loader_unavailable")
    acl=importlib.util.module_from_spec(spec)
    before=sys.dont_write_bytecode
    sys.dont_write_bytecode=True
    try:
        spec.loader.exec_module(acl)
        fixed,stage,diag,original=acl.load_reviewed_operator()
    except Exception:
        refuse("reviewed_acl_operator_unavailable")
    finally:
        sys.dont_write_bytecode=before
    return acl,fixed,stage,diag,original


def checked_command(kind,reviewed):
    acl,fixed,stage,diag,original=reviewed
    if kind not in NAME_MAP:
        refuse("worker_name_not_supported")
    if kind=="prepare":
        _,base=acl.plan(fixed,stage,diag,original)
    else:
        existing=original.transient_args("model")
        base=fixed.fixed_argv(existing,"model",original)
    unit="agentstudio-pg18-"+kind+".service"
    expected_flags={
        "--unit="+unit,
        "--property=Type=oneshot",
        "--property=DynamicUser=yes",
        "--property=User=agentstudio-pg18-"+kind,
        "--property=LoadCredential=worker.secret:"+str(original.SECRET),
        "--property=NoNewPrivileges=yes",
        "--property=ProtectHome=yes",
        "--property=ProtectSystem=strict",
        "--property=IPAddressDeny=any",
        "--property=IPAddressAllow=127.0.0.0/8",
    }
    if not expected_flags.issubset(set(base)):
        refuse("transient_security_contract_changed:"+kind)
    properties=[a for a in base if a.startswith("--property=Environment=")]
    required=[
        "AGENT_STUDIO_PG_WORKER_PASSWORD_FILE=/run/credentials/"+unit+"/worker.secret",
        "AGENT_STUDIO_PG_HOST=127.0.0.1","AGENT_STUDIO_PG_PORT=5333",
        "AGENT_STUDIO_PG_DATABASE=agent_studio",
        "AGENT_STUDIO_PG_WORKER_USER=agentstudio_stage_worker",
        "AGENT_STUDIO_PG_PILOT_ENABLED=true",
        "AGENT_STUDIO_PG_BAOTA18_ENABLED=true",
        "AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED=true",
        "AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED=true",
    ]
    if len(properties)!=1:
        refuse("environment_property_not_unique")
    values=properties[0][len("--property=Environment="):].split()
    if len(values)!=len(required) or any(values.count(x)!=1 for x in required):
        refuse("runtime_environment_not_exact:"+kind)
    if base[-1]!="--preflight" or "--serve" in base:
        refuse("forbidden_worker_launch_mode")
    reviewed_path=str(ROOT/"services/pg-api/src"/NAME_MAP[kind])
    result=list(base)
    result[-2]=reviewed_path
    if (result[-4:]!=[
        str(original.NODE),"--experimental-strip-types",
        reviewed_path,"--preflight"
    ] or sum(a!=b for a,b in zip(base,result))!=1
        or len(result)!=len(base)):
        refuse("isolated_wrapper_not_exact:"+kind)
    return result


def plan(reviewed):
    acl,fixed,stage,diag,original=reviewed
    if not original.old_services_active():
        refuse("original_pocketbase_services_not_active")
    if not all(original.unit_is_clear("agentstudio-pg18-"+k) for k in NAME_MAP):
        refuse("transient_unit_not_available")
    prepare=checked_command("prepare",reviewed)
    model=checked_command("model",reviewed)
    return {
        "mode":"pg18_native_worker_readonly_plan",
        "ready_for_two_readonly_preflights":True,
        "all_old_manifests_preserved":True,
        "new_manifest_verified":True,
        "shared_preflight_module_for_both_workers":True,
        "prepare_fixed_absolute_credential":True,
        "model_fixed_absolute_credential":True,
        "no_model_provider_or_task_engine_in_package":True,
        "only_explicit_preflight":True,
        "transient_units_started":False,
        "credential_contents_accessed":False,
        "database_connected":False,
        "db_writes_performed":False,
        "production_cutover_allowed":False,
    },[prepare,model]


def parse_preflight(stdout,kind):
    valid=[]
    for line in stdout.splitlines():
        if len(line)>4096:continue
        try: item=json.loads(line)
        except (ValueError,TypeError):continue
        if not isinstance(item,dict):continue
        if(item.get("mode")=="preflight" and
           item.get("worker")==kind and
           item.get("stage")=="complete" and
           item.get("status")=="passed" and
           item.get("target")=="agent_studio" and
           item.get("database_port")==5333 and
           item.get("verified_roles") is True and
           item.get("db_writes_performed") is False and
           item.get("worker_started") is False and
           item.get("external_model_calls") is False and
           item.get("production_cutover_allowed") is False):
            valid.append(item)
    return len(valid)==1


def failed_stage(stdout):
    for line in stdout.splitlines():
        if len(line)>4096:continue
        try: item=json.loads(line)
        except (ValueError,TypeError):continue
        if(isinstance(item,dict) and item.get("mode")=="preflight"
           and item.get("status")=="failed"):
            name=item.get("stage")
            if name in (
                "credential_binding","runtime_target_config","secret_file",
                "pg_module","pg_tcp_connection","pg_server_identity",
                "worker_role_boundary","pool_cleanup"):
                return name
    return "no_verified_preflight_json"


def preflight_both(reviewed):
    _,commands=plan(reviewed)
    _,_,_,diag,original=reviewed
    results=[]
    for name,args in zip(NAME_MAP,commands):
        if not original.unit_is_clear("agentstudio-pg18-"+name):
            refuse("transient_unit_occupied:"+name)
        try:
            completed=subprocess.run(
                args,cwd=ROOT,capture_output=True,text=True,
                timeout=65,check=False,stdin=subprocess.DEVNULL,
                env={"PATH":"/usr/bin:/bin","HOME":"/tmp","LANG":"C"})
            rc=completed.returncode
            stdout=completed.stdout or ""
            stderr=completed.stderr or ""
            success=rc==0 and parse_preflight(stdout,name)
            failure_stage="complete" if success else failed_stage(stdout)
            errors=[] if failure_stage!="no_verified_preflight_json" else diag.classify(stdout,stderr)
        except (OSError,subprocess.TimeoutExpired):
            rc=None
            success=False
            failure_stage="transient_failed_or_timeout"
            errors=["TRANSIENT_UNAVAILABLE_OR_TIMED_OUT"]
        results.append({
            "worker":name,"readonly_preflight_verified":success,
            "systemd_run_exit_code":rc,
            "stage_code":failure_stage,
            "diagnostic_codes":sorted(set(errors)),
            "worker_started":False,
        })
        if not success:
            break
    if not original.old_services_active():
        refuse("original_pocketbase_services_changed")
    return {
        "mode":"pg18_native_worker_readonly_validation",
        "results":results,
        "prepare_readonly_verified":any(x["worker"]=="prepare" and x["readonly_preflight_verified"] for x in results),
        "model_readonly_verified":any(x["worker"]=="model" and x["readonly_preflight_verified"] for x in results),
        "both_readonly_verified":len(results)==2 and all(x["readonly_preflight_verified"] for x in results),
        "worker_task_loop_started":False,
        "model_provider_called":False,
        "db_writes_intended":False,
        "raw_output_disclosed":False,
        "production_cutover_allowed":False,
    }


def main(args):
    if args not in (
        ["--plan"],["--preflight-both","--approve-two-readonly-oneshots"]
    ):
        refuse("explicit_mode_required")
    reviewed=checked_acl_operator()
    if args==["--plan"]:
        result,_=plan(reviewed)
    else:
        result=preflight_both(reviewed)
    print(json.dumps(result,sort_keys=True))
    if args!=["--plan"] and not result["both_readonly_verified"]:
        raise SystemExit(3)


if __name__=="__main__":
    main(sys.argv[1:])

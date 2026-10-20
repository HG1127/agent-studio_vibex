#!/usr/bin/env python3
"""Read-only GitHub CI gate for an outbound LAN deploy. Never changes the server.

Only an exact current main SHA with a successful COMPLETED 'push' run of
.github/workflows/agent-studio-quality.yml is eligible. If CI is missing,
in-progress, ambiguous or inaccessible: refuse the update.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler

REPOSITORY = "HG1127/agent-studio_vibex"
WORKFLOW_FILE = "agent-studio-quality.yml"
WORKFLOW_PATH = ".github/workflows/" + WORKFLOW_FILE
API = "https://api.github.com/repos/" + REPOSITORY
SHA = re.compile(r"^[0-9a-f]{40}$")
TOKEN_FILE = Path("/etc/agentstudio-lan/github-readonly-token")
MAX_RESPONSE = 1024 * 1024


class CIGateBlocked(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise CIGateBlocked("github_redirect_forbidden")


def accepted_sha(value: object) -> bool:
    return isinstance(value, str) and bool(SHA.fullmatch(value))


def parse_head(payload: object) -> str:
    if not isinstance(payload, dict) or not isinstance(payload.get("object"), dict):
        raise CIGateBlocked("github_head_response_invalid")
    sha = payload["object"].get("sha")
    if not accepted_sha(sha):
        raise CIGateBlocked("github_head_commit_invalid")
    return sha


def parse_verified_run(payload: object, sha: str) -> int:
    if not accepted_sha(sha) or not isinstance(payload, dict):
        raise CIGateBlocked("github_ci_response_invalid")
    runs = payload.get("workflow_runs")
    if not isinstance(runs, list):
        raise CIGateBlocked("github_ci_runs_missing")
    matching = []
    for item in runs:
        if not isinstance(item, dict):
            continue
        if (item.get("head_sha") != sha or item.get("event") != "push"
                or item.get("head_branch") != "main"
                or not isinstance(item.get("head_repository"), dict)
                or item["head_repository"].get("full_name") != REPOSITORY
                or not isinstance(item.get("repository"), dict)
                or item["repository"].get("full_name") != REPOSITORY):
            continue
        path = str(item.get("path") or "")
        if not (path == WORKFLOW_PATH or path.startswith(WORKFLOW_PATH + "@")):
            continue
        if not isinstance(item.get("id"), int) or isinstance(item["id"], bool):
            continue
        matching.append(item)
    if not matching:
        raise CIGateBlocked("no_matching_ci_push_for_current_main")
    # A completed older successful attempt cannot mask a newer failed rerun.
    newest = max(matching, key=lambda r: (
        str(r.get("updated_at") or ""),
        int(r.get("run_attempt") or 0),
        int(r["id"]),
    ))
    if newest.get("status") != "completed" or newest.get("conclusion") != "success":
        raise CIGateBlocked("latest_matching_ci_not_success")
    return newest["id"]


def token_from_file() -> str | None:
    if TOKEN_FILE.is_symlink():
        raise CIGateBlocked("github_token_symlink_forbidden")
    if not TOKEN_FILE.exists():
        return None  # Public repositories work anonymously, within API rate limits.
    if not TOKEN_FILE.is_file() or TOKEN_FILE.stat().st_uid != 0 or TOKEN_FILE.stat().st_mode & 0o077:
        raise CIGateBlocked("github_token_file_permissions_invalid")
    value = TOKEN_FILE.read_text("ascii").strip()
    if not value or "\n" in value or "\r" in value or len(value) > 512:
        raise CIGateBlocked("github_token_file_invalid")
    return value


def api_json(url: str, token: str | None = None) -> object:
    if not url.startswith(API + "/"):
        raise CIGateBlocked("github_url_outside_pinned_repo")
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "agentstudio-lan-ci-gate/1",
    }
    if token is not None:
        headers["Authorization"] = "Bearer " + token
    try:
        req = Request(url, headers=headers, method="GET")
        # Only this pinned GitHub API request bypasses inherited proxies. Keep
        # default certificate verification and refuse token-bearing redirects.
        opener = build_opener(ProxyHandler({}), NoRedirect())
        with opener.open(req, timeout=12) as response:
            if response.status != 200:
                raise CIGateBlocked("github_response_not_200")
            raw = response.read(MAX_RESPONSE + 1)
        if len(raw) > MAX_RESPONSE:
            raise CIGateBlocked("github_response_too_large")
        return json.loads(raw)
    except (OSError, ValueError, TimeoutError) as exc:
        raise CIGateBlocked("github_api_unavailable_or_invalid") from exc


def confirmed_head() -> tuple[str, int]:
    token = token_from_file()
    head = parse_head(api_json(API + "/git/ref/heads/main", token))
    query = urlencode({"head_sha": head, "event": "push", "per_page": "30"})
    run_id = parse_verified_run(
        api_json(API + "/actions/workflows/" + WORKFLOW_FILE + "/runs?" + query, token),
        head,
    )
    # Mitigate TOCTOU before handing SHA to a separate clean checkout.
    if parse_head(api_json(API + "/git/ref/heads/main", token)) != head:
        raise CIGateBlocked("main_advanced_during_verification")
    return head, run_id


def main() -> int:
    if sys.argv[1:] != ["--check"]:
        raise CIGateBlocked("usage_check_only")
    head, run_id = confirmed_head()
    print(json.dumps({"status": "VERIFIED_MAIN", "commit": head, "workflow_run_id": run_id}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CIGateBlocked as exc:
        # Never print tokens, HTTP response bodies, or files under /etc.
        print("LAN_CI_GATE_BLOCKED:" + str(exc), file=sys.stderr)
        raise SystemExit(2)

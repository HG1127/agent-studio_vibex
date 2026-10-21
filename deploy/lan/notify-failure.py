#!/usr/bin/env python3
"""Root-owned, opt-in LAN updater failure alerts. Never deploys or edits business data."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, ProxyHandler, HTTPRedirectHandler, build_opener

UPDATER = "agentstudio-lan-update.service"
CURRENT = Path("/srv/agent-studio-lan/current")
ALERT_DIR = Path("/var/backups/agentstudio-lan/alerts")
WEBHOOK_FILE = Path("/etc/agentstudio-lan/alert-webhook.json")
SHA = re.compile(r"releases/([0-9a-f]{40})")
SAFE_CODE = re.compile(r"[a-z0-9_]{1,100}")
CONFIG_MAX = 4096
ALERT_WINDOW_SECS = 3600


class AlertError(Exception):
    pass


class RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise AlertError("webhook_redirect_forbidden")


def safe_file(path: Path) -> bytes | None:
    if path.is_symlink():
        raise AlertError("webhook_config_symlink")
    if not path.exists():
        return None
    st = path.stat()
    if (not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_gid != 0
            or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) != 0o600
            or not 1 <= st.st_size <= CONFIG_MAX):
        raise AlertError("webhook_config_permissions_or_size")
    data = path.read_bytes()
    if len(data) != st.st_size:
        raise AlertError("webhook_config_changed")
    return data


def webhook_config(raw: bytes | None) -> dict | None:
    if raw is None:
        return None
    try:
        obj = json.loads(raw)
        if not isinstance(obj, dict) or set(obj) != {"provider", "webhook_url"}:
            raise ValueError()
        provider, url = obj["provider"], obj["webhook_url"]
        if not isinstance(url, str) or len(url) > 2048:
            raise ValueError()
        if any(ord(c) < 33 or ord(c) > 126 for c in url):
            raise ValueError()
        parts = urlsplit(url)
        if (parts.scheme != "https" or not parts.hostname or parts.username is not None
                or parts.password is not None or "@" in parts.netloc
                or parts.fragment or parts.port not in (None, 443)):
            raise ValueError()
        if provider == "feishu":
            if (parts.hostname not in ("open.feishu.cn", "open.larksuite.com")
                    or not re.fullmatch(r"/open-apis/bot/v2/hook/[A-Za-z0-9-]{16,128}", parts.path)
                    or parts.query):
                raise ValueError()
        elif provider == "wecom":
            query = parse_qs(parts.query, strict_parsing=True)
            if (parts.hostname != "qyapi.weixin.qq.com" or parts.path != "/cgi-bin/webhook/send"
                    or set(query) != {"key"} or len(query["key"]) != 1
                    or not re.fullmatch(r"[A-Za-z0-9-]{16,128}", query["key"][0])):
                raise ValueError()
        else:
            raise ValueError()
        return {"provider": provider, "webhook_url": url}
    except (ValueError, UnicodeError, TypeError, KeyError):
        raise AlertError("invalid_webhook_configuration") from None


def status() -> dict:
    raw = subprocess.check_output(
        ["/usr/bin/systemctl", "show", UPDATER, "--no-pager",
         "-p", "Result", "-p", "ExecMainStatus", "-p", "ActiveState"],
        timeout=8, encoding="utf8", errors="replace")
    return dict(line.split("=", 1) for line in raw.splitlines() if "=" in line)


def failure_classification() -> str:
    try:
        raw = subprocess.check_output(
            ["/usr/bin/journalctl", "-u", UPDATER, "-n", "100", "--no-pager", "-o", "cat"],
            timeout=8, encoding="utf8", errors="replace")
    except (OSError, subprocess.SubprocessError):
        return "unspecified_failure"
    lines = raw.splitlines()
    # Do not accidentally report a diagnostic from an older failed attempt.
    for index in range(len(lines) - 1, -1, -1):
        if "Starting agentstudio-lan-update.service" in lines[index]:
            lines = lines[index:]
            break
    for line in reversed(lines):
        if "LAN_RECOVERY_REQUIRES_OPERATOR" in line:
            return "recovery_requires_operator"
        if "LAN_DEPLOY_FAILED_REQUIRES_OPERATOR" in line:
            return "deploy_failed_requires_operator"
        for prefix in ("LAN_PULL_BLOCKED:", "LAN_DEPLOY_BLOCKED:"):
            if prefix in line:
                tail = line.split(prefix, 1)[1].strip().split(maxsplit=1)
                code = tail[0] if tail else ""
                return code if SAFE_CODE.fullmatch(code) else "unspecified_failure"
    return "unspecified_failure"


def current_sha() -> str:
    try:
        matched = SHA.fullmatch(os.readlink(CURRENT))
        return matched.group(1) if matched else "unknown"
    except OSError:
        return "unknown"


def verified_directory(folder: Path) -> None:
    if folder.is_symlink():
        raise AlertError("incident_dir_symlink")
    st = folder.stat()
    if (not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_gid != 0
            or stat.S_IMODE(st.st_mode) != 0o700):
        raise AlertError("incident_dir_permissions_invalid")


def atomic_private_file(folder: Path, name: str, data: bytes) -> None:
    target = folder / name
    if os.name != "nt" and not hasattr(os, "O_NOFOLLOW"):
        raise AlertError("no_no_follow_supported")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(target, flags, 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())


def save_incident(record: dict) -> Path:
    verified_directory(ALERT_DIR)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    name = f"failure-{stamp}-{os.getpid()}.json"
    data = (json.dumps(record, ensure_ascii=True, sort_keys=True) + "\n").encode("ascii")
    atomic_private_file(ALERT_DIR, name, data)
    return ALERT_DIR / name


def message_for(record: dict) -> str:
    return ("Agent Studio LAN 自动部署失败\n"
            f"时间 UTC：{record['utc']}\n"
            f"分类：{record['category']}\n"
            f"systemd：{record['result']} (exit={record['exit_code']})\n"
            f"当前 SHA：{record['current_sha']}\n"
            "请检查 agentstudio-lan-update.service 日志和业务健康状态。"
            "涉及恢复异常时暂停定时器，禁止直接重放发布。")


def post_webhook(config: dict, message: str) -> None:
    if config["provider"] == "feishu":
        body = {"msg_type": "text", "content": {"text": message}}
    else:
        body = {"msgtype": "text", "text": {"content": message}}
    payload = json.dumps(body, ensure_ascii=False).encode("utf8")
    request = Request(config["webhook_url"], data=payload, method="POST",
                      headers={"Content-Type": "application/json",
                               "User-Agent": "agentstudio-lan-alert/1"})
    try:
        # No implicit proxy, no token-bearing redirects. Standard certificate verification.
        opener = build_opener(ProxyHandler({}), RejectRedirect())
        with opener.open(request, timeout=8) as response:
            if response.status != 200:
                raise AlertError("webhook_non_200")
            raw = response.read(8193)
        if len(raw) > 8192:
            raise AlertError("webhook_response_too_large")
        parsed = json.loads(raw)
        if not isinstance(parsed, dict) or parsed.get("code", parsed.get("errcode")) != 0:
            raise AlertError("webhook_response_unconfirmed")
    except AlertError:
        raise
    except (OSError, ValueError, TimeoutError):
        raise AlertError("webhook_delivery_unavailable") from None


def main(argv: list[str]) -> int:
    if argv == ["--self-test"]:
        verified_directory(ALERT_DIR)
        configured = webhook_config(safe_file(WEBHOOK_FILE))
        print("ALERT_SELF_TEST_OK", "webhook_configured=" + ("yes" if configured else "no"))
        return 0
    if argv == ["--test-delivery"]:
        configured = webhook_config(safe_file(WEBHOOK_FILE))
        if configured is None:
            raise AlertError("webhook_not_configured")
        post_webhook(configured, "TEST: Agent Studio LAN 告警通道测试（非实际故障）")
        print("ALERT_TEST_DELIVERY_OK")
        return 0
    if argv:
        raise AlertError("usage_self_test_or_test_delivery")
    state = status()
    if state.get("Result") == "success" and state.get("ExecMainStatus") == "0":
        print("ALERT_NO_FAILURE")
        return 0
    if state.get("ActiveState") not in ("failed", "inactive"):
        raise AlertError("updater_not_in_terminal_state")
    record = {"schema": 1, "utc": datetime.now(timezone.utc).isoformat(),
              "unit": UPDATER, "category": failure_classification(),
              "result": state.get("Result", "unknown")[:40],
              "exit_code": re.sub(r"[^0-9]", "", state.get("ExecMainStatus", ""))[:4] or "unknown",
              "current_sha": current_sha()}
    incident = save_incident(record)
    print("ALERT_INCIDENT_RECORDED", incident.name)
    configured = webhook_config(safe_file(WEBHOOK_FILE))
    if configured is None:
        print("ALERT_LOCAL_ONLY_NO_WEBHOOK_CONFIG")
        return 0
    # Keep a durable incident for every failure. Throttle only external delivery.
    signature = hashlib.sha256(
        f"{record['category']}|{record['result']}|{record['current_sha']}".encode()).hexdigest()
    marker = ALERT_DIR / ("sent-" + signature)
    if marker.is_symlink():
        raise AlertError("dedup_marker_symlink")
    if marker.exists():
        st = marker.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_gid != 0
                or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) != 0o600):
            raise AlertError("dedup_marker_invalid")
        if time.time() - st.st_mtime < ALERT_WINDOW_SECS:
            print("ALERT_DELIVERY_RATE_LIMITED")
            return 0
    post_webhook(configured, message_for(record))
    if marker.exists():
        marker.unlink()
    atomic_private_file(ALERT_DIR, marker.name, b"sent\n")
    print("ALERT_WEBHOOK_DELIVERED")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except (AlertError, OSError, subprocess.SubprocessError) as exc:
        code = str(exc) if isinstance(exc, AlertError) else "local_alert_failure"
        print("LAN_ALERT_FAILED:" + code[:100], file=sys.stderr)
        raise SystemExit(1)

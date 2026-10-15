#!/usr/bin/env python3
"""Source-only V8 PostgreSQL pilot packaging; never touches BaoTa/production.

Create one standalone PG pilot ops kit and one complete project source archive.
Exclude credentials, database payloads, node_modules, binaries and logs.
Always verify ZIP CRC, filename allowlists and SHA-256 after construction.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "deliverables"
FULL_DIRS = (
    "src", "public", "pocketbase/pb_hooks", "worker", "tests", "docs",
    "ops", "deploy", "services/pg-api", "db/postgres",
    ".github/workflows", "vibex-local",
)
FULL_FILES = (
    "README.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    "vite.config.ts", "eslint.config.js", "tsconfig.json",
    "tsconfig.app.json", "tsconfig.node.json", "tailwind.config.js",
    "postcss.config.js", "components.json", "index.html", ".vibex-app-type",
)
OPS_DIRS = (
    "services/pg-api", "db/postgres", "deploy/postgres-staging",
)
OPS_FILES = (
    "README.md",
    "docs/POSTGRES_V8_STAGING.md",
    "docs/POSTGRES_V8_API_PILOT.md",
    "docs/POSTGRES_V8_KNOWLEDGE_METADATA.md",
    "docs/POSTGRES_V8_DOCUMENT_ISOLATION.md",
    "docs/POSTGRES_V8_1_AGENT_PREPARE.md",
    "docs/INTERNAL_GO_LIVE_CHECKLIST.md",
    "docs/INTERNAL_DEPLOYMENT_PREFLIGHT.md",
)
BLOCKED_DIRS = {
    "node_modules", "dist", "pb_data", "__pycache__", ".git",
    ".vibex", ".superpowers", ".cache", ".ci-bin", ".pnpm-store",
    "deliverables", ".vite", ".next",
}
BLOCKED_EXTS = {
    ".exe", ".dll", ".db", ".sqlite", ".sqlite3", ".log", ".pyc",
    ".pdb", ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".zip", ".7z", ".rar", ".gz", ".tar",
    ".pem", ".key", ".pfx", ".p12", ".crt",
}
REQUIRED_V8 = {
    "services/pg-api/src/server.ts",
    "services/pg-api/src/document-worker.ts",
    "services/pg-api/src/document-parser.worker.mjs",
    "services/pg-api/tests/document-worker.test.mjs",
    "services/pg-api/tests/knowledge-engine.test.mjs",
    "services/pg-api/pnpm-lock.yaml",
    "db/postgres/001_stage_schema.sql",
    "deploy/postgres-staging/compose.yaml",
    "docs/POSTGRES_V8_DOCUMENT_ISOLATION.md",
    "docs/POSTGRES_V8_1_AGENT_PREPARE.md",
    "services/pg-api/src/agent-worker.ts",
    "services/pg-api/src/run-repository.ts",
    "services/pg-api/src/worker-loop.ts",
    "services/pg-api/tests/agent-prepare-engine.test.mjs",
    "services/pg-api/tests/worker-login.test.mjs",
    "services/pg-api/tests/worker-upgrade.test.mjs",
    "db/postgres/005_claim_agent_prepare.sql",
    "db/postgres/012_stage_worker_login.sql",
    "db/postgres/migrations/pg_v8_003_prepare_worker.sql",
}


def valid(f: Path) -> bool:
    rel = f.relative_to(ROOT)
    parts = rel.parts
    if not f.is_file() or f.is_symlink():
        return False
    if any(x in BLOCKED_DIRS or x.lower().startswith(".env") for x in parts):
        return False
    if f.suffix.lower() in BLOCKED_EXTS:
        return False
    if f.name.lower() in {"id_rsa", "id_ed25519", "credentials.json", "secret.json"}:
        return False
    return f.stat().st_size <= 12 * 1024 * 1024


def select(dirs: tuple[str, ...], files: tuple[str, ...]) -> list[Path]:
    chosen: set[Path] = set()
    for name in dirs:
        folder = ROOT / name
        if not folder.is_dir():
            raise FileNotFoundError(f"Missing source directory: {name}")
        chosen.update(f for f in folder.rglob("*") if valid(f))
    for name in files:
        f = ROOT / name
        if f.is_file() and valid(f):
            chosen.add(f)
        else:
            raise FileNotFoundError(f"Missing or forbidden source file: {name}")
    return sorted(chosen, key=lambda f: f.relative_to(ROOT).as_posix())


def pack(name: str, files: list[Path]) -> dict:
    OUT.mkdir(exist_ok=True)
    output = OUT / name
    with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=7) as archive:
        for file in files:
            item = file.relative_to(ROOT).as_posix()
            zi = ZipInfo(item, date_time=(2026, 10, 14, 0, 0, 0))
            zi.compress_type = ZIP_DEFLATED
            zi.external_attr = 0o100644 << 16
            archive.writestr(zi, file.read_bytes(), compress_type=ZIP_DEFLATED)
    with ZipFile(output) as archive:
        members = archive.namelist()
        assert archive.testzip() is None, "ZIP failed CRC check"
        assert len(members) == len(set(members)), "ZIP has duplicate entries"
        assert REQUIRED_V8.issubset(set(members)), sorted(REQUIRED_V8 - set(members))
        for member in members:
            assert not member.startswith("/") and ".." not in Path(member).parts
            assert all(p not in BLOCKED_DIRS and not p.startswith(".env") for p in member.split("/"))
    return {
        "filename": name,
        "entries": len(files),
        "bytes": output.stat().st_size,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "zip_crc": "PASS",
    }


def main() -> None:
    full = pack("agentstudio_v8_1_complete_source_20261014.zip",
                select(FULL_DIRS, FULL_FILES))
    ops = pack("agentstudio_v8_1_postgres_worker_ops_20261014.zip",
               select(OPS_DIRS, OPS_FILES))
    manifest = {
        "release": "Agent Studio V8.1 PostgreSQL Agent preparation Worker pilot",
        "date": "2026-10-14",
        "production_ready": False,
        "production_db_migrated": False,
        "existing_vibex_pocketbase_unchanged": True,
        "do_not_upload_ops_zip_to_vibex_source": True,
        "warnings": [
            "PostgreSQL 17 on BaoTa not deployed/tested",
            "Real OIDC, model-capable Worker, backup and employee acceptance not verified",
            "PDF/DOCX parser child process is not a hardened OS sandbox",
        ],
        "artifacts": [full, ops],
    }
    path = OUT / "agentstudio_v8_1_release_manifest_20261014.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    for archive in (full, ops):
        print("PACK_VERIFIED", archive["filename"], archive["entries"],
              "files", archive["bytes"], "bytes", "sha256", archive["sha256"])
    print("STATUS=SOURCE_ONLY_NOT_DEPLOYED", path.name)


if __name__ == "__main__":
    main()

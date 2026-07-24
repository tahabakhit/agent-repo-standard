#!/usr/bin/env python3
"""kb — config-driven knowledge-save CLI (stdlib only, portable).

Verbs:
  save      Save a markdown knowledge entry into the configured store.
  validate  Re-validate all entries in the store against the schema.
  stale     List entries whose last_verified + ttl is past today.
  doctor    Report store health (broken links, schema errors, missing index entries).

Config precedence (highest to lowest):
  --store flag
  AMANAR_KB_DIR environment variable
  ./.knowledge  (directory in CWD treated as the store)
  ./.kb/config.yml  (project-level pointer to store)
  $XDG_CONFIG_HOME/amanar/kb.yml or ~/.config/amanar/kb.yml
  ask on first use (or exit with error when --no-interactive / stdin is not a tty)

The store is self-describing: <store>/.kb/config.yml lives inside the store and
carries schema + ttl policy + commit policy.  The tool itself is stateless.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema" / "entry.schema.json"


def _die(msg: str, code: int = 1) -> None:
    print(f"kb: error: {msg}", file=sys.stderr)
    sys.exit(code)


def _warn(msg: str) -> None:
    print(f"kb: warning: {msg}", file=sys.stderr)


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Minimal YAML frontmatter parser / serializer (no third-party deps)
# ---------------------------------------------------------------------------

def _unquote(s: str) -> str:
    """Strip surrounding single or double quotes from a scalar string."""
    s = s.strip()
    if len(s) >= 2 and (
        (s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'")
    ):
        return s[1:-1]
    return s


def _quote_scalar(s: str) -> str:
    """Return a YAML-safe scalar, quoting when necessary."""
    if not s:
        return '""'
    special = set(':{}[]|>&!%@`#,\'"')
    if (
        any(c in special for c in s)
        or s[0] in ' \t'
        or s[-1] in ' \t'
        or '\n' in s
    ):
        escaped = s.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{escaped}"'
    return s


def _parse_frontmatter(text: str) -> dict[str, Any]:
    """Parse the YAML subset used by the entry schema.

    Handles:
      key: scalar
      key: [inline, list]
      key:
        - scalar_item
        - nested_key: val      (first sub-key on same line as dash)
          further_key: val     (subsequent sub-keys indented under dash)
    """
    lines = text.splitlines()
    n = len(lines)
    result: dict[str, Any] = {}
    i = 0

    def skip_blank(idx: int) -> int:
        while idx < n and not lines[idx].strip():
            idx += 1
        return idx

    while i < n:
        i = skip_blank(i)
        if i >= n:
            break
        line = lines[i]
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        if indent > 0:
            # Unexpected deeply-indented line at the top level; skip.
            i += 1
            continue
        m = re.match(r'^([\w-]+):\s*(.*)', line)
        if not m:
            i += 1
            continue
        key = m.group(1)
        val_raw = m.group(2).strip()

        if val_raw:
            # Inline value (scalar or inline list).
            if val_raw.startswith('[') and val_raw.endswith(']'):
                inner = val_raw[1:-1].strip()
                result[key] = (
                    [_unquote(v) for v in inner.split(',') if v.strip()]
                    if inner
                    else []
                )
            else:
                result[key] = _unquote(val_raw)
            i += 1
        else:
            # Block value follows on subsequent lines.
            i += 1
            i = skip_blank(i)
            if i >= n:
                result[key] = None
                break
            first_stripped = lines[i].lstrip()
            if first_stripped.startswith('- ') or first_stripped == '-':
                # Block list.
                items: list[Any] = []
                while i < n:
                    bl = lines[i]
                    bls = bl.lstrip()
                    bls_indent = len(bl) - len(bls)
                    if not bls:
                        i += 1
                        continue
                    # A zero-indent non-dash line signals the next top-level key.
                    if bls_indent == 0 and not bls.startswith('-'):
                        break
                    if bls.startswith('- '):
                        item_text = bls[2:].strip()
                        i += 1
                        km = re.match(r'^([\w-]+):\s*(.*)', item_text)
                        if km:
                            # Nested object: first sub-key inline with the dash.
                            obj: dict[str, Any] = {km.group(1): _unquote(km.group(2).strip())}
                            while i < n:
                                sl = lines[i]
                                sls = sl.lstrip()
                                if not sls:
                                    break
                                if len(sl) - len(sls) == 0:
                                    break  # back to top-level
                                sm = re.match(r'^([\w-]+):\s*(.*)', sls)
                                if sm:
                                    obj[sm.group(1)] = _unquote(sm.group(2).strip())
                                i += 1
                            items.append(obj)
                        elif item_text:
                            items.append(_unquote(item_text))
                        else:
                            items.append(None)
                    else:
                        # Unexpected format; skip.
                        i += 1
                result[key] = items
            else:
                result[key] = _unquote(first_stripped)
                i += 1

    return result


def _serialize_frontmatter(data: dict[str, Any]) -> str:
    """Serialize a dict to the YAML frontmatter block (including --- delimiters)."""
    lines = ['---']
    for key, val in data.items():
        if isinstance(val, list):
            if not val:
                lines.append(f'{key}: []')
            else:
                lines.append(f'{key}:')
                for item in val:
                    if isinstance(item, dict):
                        pairs = list(item.items())
                        if not pairs:
                            lines.append('  -')
                        else:
                            k0, v0 = pairs[0]
                            lines.append(f'  - {k0}: {_quote_scalar(str(v0))}')
                            for k, v in pairs[1:]:
                                lines.append(f'    {k}: {_quote_scalar(str(v))}')
                    else:
                        lines.append(f'  - {_quote_scalar(str(item))}')
        elif val is None:
            lines.append(f'{key}:')
        else:
            lines.append(f'{key}: {_quote_scalar(str(val))}')
    lines.append('---')
    return '\n'.join(lines)


def _split_entry_text(text: str) -> tuple[str, str]:
    """Split raw entry text into (frontmatter_body, markdown_body).

    Returns ('', text) when no frontmatter delimiters are found.
    """
    if not text.startswith('---'):
        return '', text
    rest = text[3:]
    # Allow the opening --- to be followed immediately by a newline.
    if rest and rest[0] in ('\r', '\n'):
        rest = rest.lstrip('\r\n')
    end = rest.find('\n---')
    if end == -1:
        return '', text
    fm_text = rest[:end].rstrip()
    body = rest[end + 4:].lstrip('\n')
    return fm_text, body


def _read_entry(path: Path) -> tuple[dict[str, Any], str]:
    """Return (frontmatter_dict, body_text) for an entry file."""
    raw = path.read_text(encoding='utf-8')
    fm_text, body = _split_entry_text(raw)
    return _parse_frontmatter(fm_text), body


def _write_entry(path: Path, fm: dict[str, Any], body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = _serialize_frontmatter(fm) + '\n\n' + body.lstrip('\n')
    path.write_text(content, encoding='utf-8')


# ---------------------------------------------------------------------------
# Secret scanner
# ---------------------------------------------------------------------------

_SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'AKIA[0-9A-Z]{16}'), "AWS access key (AKIA…)"),
    (
        re.compile(r'-----BEGIN\s+(?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'),
        "PEM private key block",
    ),
    (
        re.compile(
            r'(?i)(?:password|passwd|api[_-]key|secret[_-]key|auth[_-]token|access[_-]token)'
            r'\s*[:=]\s*["\']?[A-Za-z0-9+/=_\-]{8,}'
        ),
        "credential assignment",
    ),
]

_MIN_ENTROPY_LEN = 20
_ENTROPY_THRESHOLD = 4.5


def _shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in freq.values())


def _scan_secrets(text: str) -> list[str]:
    """Return a list of human-readable findings. Empty list means clean."""
    findings: list[str] = []
    for pattern, label in _SECRET_PATTERNS:
        m = pattern.search(text)
        if m:
            preview = m.group()[:60].replace('\n', ' ')
            findings.append(f"{label}: {preview!r}")
    # High-entropy token heuristic: flag the first offender only.
    for token in re.findall(r'[A-Za-z0-9+/=_\-]{20,}', text):
        if _shannon_entropy(token) >= _ENTROPY_THRESHOLD:
            findings.append(f"high-entropy token ({len(token)} chars): {token[:20]!r}…")
            break
    return findings


# ---------------------------------------------------------------------------
# Schema validation (stdlib — no jsonschema package)
# ---------------------------------------------------------------------------

_REQUIRED = {"id", "type", "title", "status"}
_ENUMS: dict[str, set[str]] = {
    "status": {"active", "reference", "archive"},
    "confidence": {"low", "medium", high := "high"},
    "provenance": {"agent", "human", "distilled"},
}
_LIST_FIELDS = {"tags", "sources"}
_TTL_RE = re.compile(r'^\d+(d|m|y)$')


def validate_entry(fm: dict[str, Any]) -> list[str]:
    """Return a list of validation errors. Empty means valid."""
    errors: list[str] = []

    for field in _REQUIRED:
        if not fm.get(field):
            errors.append(f"required field missing or empty: {field!r}")

    for field, allowed in _ENUMS.items():
        val = fm.get(field)
        if val is not None and val not in allowed:
            errors.append(f"{field!r} must be one of {sorted(allowed)}, got {val!r}")

    for field in _LIST_FIELDS:
        val = fm.get(field)
        if val is not None and not isinstance(val, list):
            errors.append(f"{field!r} must be a list")

    ttl = fm.get("ttl")
    if ttl is not None and not _TTL_RE.match(str(ttl)):
        errors.append(f"'ttl' must match <N>(d|m|y), got {ttl!r}")

    return errors


# ---------------------------------------------------------------------------
# TTL / stale helpers
# ---------------------------------------------------------------------------

def _parse_ttl(ttl_str: str) -> datetime.timedelta:
    m = _TTL_RE.match(ttl_str.strip())
    if not m:
        raise ValueError(f"invalid TTL: {ttl_str!r}")
    n = int(ttl_str[:-1])
    unit = ttl_str[-1]
    if unit == 'd':
        return datetime.timedelta(days=n)
    if unit == 'm':
        return datetime.timedelta(days=n * 30)
    return datetime.timedelta(days=n * 365)


def _parse_iso(s: str) -> datetime.datetime:
    s = s.replace('Z', '+00:00')
    try:
        return datetime.datetime.fromisoformat(s)
    except ValueError:
        # Fallback: strip timezone and parse naive.
        return datetime.datetime.fromisoformat(s.split('+')[0].split('-')[0])


# ---------------------------------------------------------------------------
# Config resolution
# ---------------------------------------------------------------------------

_STORE_CONFIG_NAME = ".kb"
_STORE_CONFIG_FILE = "config.yml"


def _read_simple_yaml_file(path: Path) -> dict[str, str]:
    """Read a flat key: value YAML file (no nesting, no lists needed here)."""
    result: dict[str, str] = {}
    try:
        for line in path.read_text(encoding='utf-8').splitlines():
            m = re.match(r'^([\w-]+):\s*(.*)', line.strip())
            if m:
                result[m.group(1)] = _unquote(m.group(2).strip())
    except OSError:
        pass
    return result


def resolve_store(
    flag_store: str | None = None,
    *,
    interactive: bool = True,
    env: dict[str, str] | None = None,
    cwd: Path | None = None,
    home: Path | None = None,
) -> Path:
    """Resolve the knowledge store path using the precedence chain.

    Parameters mirror the real environment but can be overridden in tests.
    """
    _env = env if env is not None else dict(os.environ)
    _cwd = cwd or Path.cwd()
    _home = home or Path.home()

    # 1. --store flag
    if flag_store:
        return Path(flag_store).expanduser().resolve()

    # 2. AMANAR_KB_DIR env
    env_val = _env.get("AMANAR_KB_DIR", "")
    if env_val:
        return Path(env_val).expanduser().resolve()

    # 3. ./.knowledge directory in cwd
    cwd_store = _cwd / ".knowledge"
    if cwd_store.is_dir():
        return cwd_store.resolve()

    # 4. ./.kb/config.yml project pointer
    project_cfg = _cwd / ".kb" / _STORE_CONFIG_FILE
    if project_cfg.is_file():
        cfg = _read_simple_yaml_file(project_cfg)
        if cfg.get("store"):
            return Path(cfg["store"]).expanduser().resolve()

    # 5. XDG / user config
    xdg_config = _env.get("XDG_CONFIG_HOME", "")
    if xdg_config:
        user_cfg = Path(xdg_config) / "amanar" / "kb.yml"
    else:
        user_cfg = _home / ".config" / "amanar" / "kb.yml"
    if user_cfg.is_file():
        cfg = _read_simple_yaml_file(user_cfg)
        if cfg.get("store"):
            return Path(cfg["store"]).expanduser().resolve()

    # 6. Ask or error
    if not interactive:
        _die(
            "no store configured; set --store, AMANAR_KB_DIR, "
            "or create ~/.config/amanar/kb.yml with store: <path>"
        )
    sys.stderr.write("kb: no store configured.\n")
    raw = input("Enter knowledge store path: ").strip()
    if not raw:
        _die("no store path provided")
    return Path(raw).expanduser().resolve()


def _read_store_config(store: Path) -> dict[str, str]:
    cfg_path = store / _STORE_CONFIG_NAME / _STORE_CONFIG_FILE
    defaults: dict[str, str] = {
        "commit_policy": "auto",
        "ttl_policy": "90d",
    }
    if cfg_path.is_file():
        loaded = _read_simple_yaml_file(cfg_path)
        defaults.update(loaded)
    return defaults


def _ensure_store(store: Path) -> None:
    """Create the store directory and its internal config if absent."""
    store.mkdir(parents=True, exist_ok=True)
    cfg_dir = store / _STORE_CONFIG_NAME
    cfg_dir.mkdir(exist_ok=True)
    cfg_file = cfg_dir / _STORE_CONFIG_FILE
    if not cfg_file.exists():
        cfg_file.write_text(
            "commit_policy: auto\nttl_policy: 90d\n",
            encoding='utf-8',
        )
    # Ensure manifest and log exist.
    manifest = store / "manifest.json"
    if not manifest.exists():
        manifest.write_text(json.dumps({"entries": []}, indent=2) + '\n', encoding='utf-8')
    log_path = store / "log.md"
    if not log_path.exists():
        log_path.write_text("# Knowledge store log\n\n", encoding='utf-8')


# ---------------------------------------------------------------------------
# Manifest helpers
# ---------------------------------------------------------------------------

def _load_manifest(store: Path) -> dict[str, Any]:
    manifest_path = store / "manifest.json"
    if not manifest_path.exists():
        return {"entries": []}
    try:
        return json.loads(manifest_path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return {"entries": []}


def _save_manifest(store: Path, manifest: dict[str, Any]) -> None:
    (store / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + '\n', encoding='utf-8'
    )


def _rebuild_manifest(store: Path) -> dict[str, Any]:
    """Rebuild manifest.json by scanning all .md entry files in the store."""
    entries: list[dict[str, Any]] = []
    for md_file in sorted(store.rglob("*.md")):
        rel = md_file.relative_to(store)
        parts = rel.parts
        # Skip internal files: log.md, _index.md, and files inside .kb/
        if parts[0] == _STORE_CONFIG_NAME:
            continue
        if md_file.name in ("log.md",) or md_file.name.startswith("_"):
            continue
        try:
            fm, _ = _read_entry(md_file)
        except Exception:
            continue
        if not fm.get("id"):
            continue
        entries.append({
            "id": fm.get("id"),
            "type": fm.get("type"),
            "title": fm.get("title"),
            "status": fm.get("status"),
            "tags": fm.get("tags") or [],
            "path": str(rel),
            "created": fm.get("created"),
            "last_verified": fm.get("last_verified"),
            "ttl": fm.get("ttl"),
        })
    manifest = {"entries": entries}
    _save_manifest(store, manifest)
    return manifest


# ---------------------------------------------------------------------------
# _index.md helpers
# ---------------------------------------------------------------------------

def _update_index(store: Path, subdir: Path, entry_id: str, title: str, filename: str) -> None:
    """Add or refresh a link in the directory's _index.md."""
    index_path = subdir / "_index.md"
    link = f"- [{title}]({filename})"

    if index_path.exists():
        existing = index_path.read_text(encoding='utf-8')
        # Replace existing link for the same entry filename.
        lines = existing.splitlines()
        new_lines: list[str] = []
        found = False
        for line in lines:
            if f"]({filename})" in line:
                new_lines.append(link)
                found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(link)
        index_path.write_text('\n'.join(new_lines) + '\n', encoding='utf-8')
    else:
        heading = f"# {subdir.name.capitalize()} index\n\n"
        index_path.write_text(heading + link + '\n', encoding='utf-8')


# ---------------------------------------------------------------------------
# Relative-link checker
# ---------------------------------------------------------------------------

_MD_LINK_RE = re.compile(r'\[(?:[^\]]*)\]\(([^)]+)\)')


def _check_links(body: str, base_dir: Path) -> list[str]:
    """Return a list of broken relative-link descriptions."""
    broken: list[str] = []
    for href in _MD_LINK_RE.findall(body):
        if href.startswith(('http://', 'https://', 'mailto:', '#')):
            continue
        target = (base_dir / href).resolve()
        if not target.exists():
            broken.append(href)
    return broken


# ---------------------------------------------------------------------------
# Dedup: archive-with-pointer
# ---------------------------------------------------------------------------

def _find_duplicates(
    manifest: dict[str, Any], title: str, tags: list[str]
) -> list[dict[str, Any]]:
    """Return manifest entries that overlap with the candidate title or tags."""
    candidates: list[dict[str, Any]] = []
    title_lower = title.lower().strip()
    tag_set = {t.lower() for t in tags}
    for entry in manifest.get("entries", []):
        if entry.get("status") == "archive":
            continue
        existing_title = (entry.get("title") or "").lower().strip()
        existing_tags = {t.lower() for t in (entry.get("tags") or [])}
        title_match = existing_title == title_lower
        tag_overlap = bool(tag_set & existing_tags) if tag_set and existing_tags else False
        if title_match or tag_overlap:
            candidates.append(entry)
    return candidates


def _archive_entry(store: Path, entry_meta: dict[str, Any], pointer_id: str) -> None:
    """Mark an existing entry as archived and add a forward pointer."""
    entry_path = store / entry_meta["path"]
    if not entry_path.exists():
        return
    fm, body = _read_entry(entry_path)
    fm["status"] = "archive"
    pointer_note = f"\n\n<!-- superseded by entry id:{pointer_id} -->\n"
    _write_entry(entry_path, fm, body + pointer_note)


# ---------------------------------------------------------------------------
# Git helpers (store-targeted only)
# ---------------------------------------------------------------------------

def _git(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
    )


def _ensure_git_repo(store: Path) -> None:
    """Initialise the store as a git repository if it is not one already."""
    result = _git(["rev-parse", "--git-dir"], store)
    if result.returncode != 0:
        _git(["init", "-q"], store)
        _git(["config", "user.email", "kb@amanar.local"], store)
        _git(["config", "user.name", "kb"], store)


def _git_commit_store(store: Path, message: str, paths: list[Path]) -> bool:
    """Stage and commit specific paths in the store. Return True on success."""
    _ensure_git_repo(store)
    rel_paths = [str(p.relative_to(store)) for p in paths if p.exists()]
    if not rel_paths:
        return False
    _git(["add"] + rel_paths, store)
    result = _git(["commit", "-m", message], store)
    if result.returncode != 0:
        # Nothing to commit is fine; other errors are warnings only.
        if "nothing to commit" not in result.stdout + result.stderr:
            _warn(f"git commit: {result.stderr.strip()}")
            return False
    return True


# ---------------------------------------------------------------------------
# Optional gitleaks defense-in-depth
# ---------------------------------------------------------------------------

def _run_gitleaks_check(store: Path) -> list[str]:
    """Run gitleaks against the store if the binary is available.

    Uses 'gitleaks detect --no-git --source <store>' to scan the store
    directory for secrets without requiring a staged git index.

    Returns a list of finding descriptions.  An empty list means either
    gitleaks is absent (no hard dependency) or the scan found nothing.
    Non-zero gitleaks exit codes are treated as findings and the caller
    must abort the commit.
    """
    if shutil.which("gitleaks") is None:
        return []
    result = subprocess.run(
        ["gitleaks", "detect", "--no-git", "--source", str(store)],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return []
    output = (result.stdout + result.stderr).strip()
    lines = [line for line in output.splitlines() if line.strip()]
    return [f"gitleaks: {line}" for line in lines] if lines else ["gitleaks: secrets detected (no detail)"]


# ---------------------------------------------------------------------------
# Verb: save
# ---------------------------------------------------------------------------

def cmd_save(args: argparse.Namespace) -> int:
    store = resolve_store(
        args.store,
        interactive=not args.no_interactive,
    )
    _ensure_store(store)
    cfg = _read_store_config(store)
    commit_policy = cfg.get("commit_policy", "auto")
    default_ttl = cfg.get("ttl_policy", "90d")

    # Read content.
    if args.file:
        content = Path(args.file).read_text(encoding='utf-8')
    else:
        content = sys.stdin.read()

    if not content.strip():
        _die("content is empty; pipe markdown via stdin or supply --file")

    # ---- Step 1: secret scan ----
    findings = _scan_secrets(content)
    if findings:
        print("kb: ABORTED — secrets detected in candidate content:", file=sys.stderr)
        for f in findings:
            print(f"  • {f}", file=sys.stderr)
        return 1

    # Build frontmatter dict from args.
    entry_id = args.id or str(uuid.uuid4())
    now = _now_iso()
    tags = [t.strip() for t in (args.tags or "").split(',') if t.strip()]
    sources: list[dict[str, str]] = []
    for url in (args.sources or []):
        sources.append({"url": url, "sha256": "", "ingested": now})

    fm: dict[str, Any] = {
        "id": entry_id,
        "type": args.type or "fact",
        "title": args.title or "Untitled",
        "status": args.status or "active",
        "tags": tags,
        "created": now,
        "last_verified": now,
        "ttl": args.ttl or default_ttl,
        "provenance": args.provenance or "human",
    }
    if args.description:
        fm["description"] = args.description
    if args.confidence:
        fm["confidence"] = args.confidence
    if sources:
        fm["sources"] = sources

    # ---- Step 2: schema validate ----
    errors = validate_entry(fm)
    if errors:
        print("kb: ABORTED — schema validation failed:", file=sys.stderr)
        for e in errors:
            print(f"  • {e}", file=sys.stderr)
        return 1

    # ---- Step 3: dedup ----
    manifest = _load_manifest(store)
    dupes = _find_duplicates(manifest, fm["title"], tags)
    for dupe in dupes:
        _warn(f"possible duplicate: {dupe['title']!r} (id={dupe['id']}) — archiving old entry")
        _archive_entry(store, dupe, entry_id)

    # ---- Step 4: link check ----
    body_text = content
    entry_type_dir = store / (fm["type"])
    broken = _check_links(body_text, entry_type_dir)
    if broken:
        _warn(f"broken relative links in content (not blocking): {broken}")

    # ---- Step 5: write entry ----
    filename = f"{entry_id}.md"
    entry_path = entry_type_dir / filename
    _write_entry(entry_path, fm, body_text)

    # ---- Step 5b: update _index.md ----
    _update_index(store, entry_type_dir, entry_id, fm["title"], filename)

    # ---- Step 5c: append to log.md ----
    log_path = store / "log.md"
    log_line = f"- {now}  save  [{fm['title']}]({fm['type']}/{filename})  id:{entry_id}\n"
    with log_path.open('a', encoding='utf-8') as fh:
        fh.write(log_line)

    # ---- Step 5d: regenerate manifest.json ----
    _rebuild_manifest(store)

    # ---- Step 5e: optional gitleaks defense-in-depth ----
    gl_findings = _run_gitleaks_check(store)
    if gl_findings:
        print("kb: ABORTED — gitleaks detected secrets; commit suppressed:", file=sys.stderr)
        for f in gl_findings:
            print(f"  • {f}", file=sys.stderr)
        return 1

    # ---- Step 6: git commit ----
    if commit_policy == "auto":
        msg = f"kb: save {fm['type']}: {fm['title']}"
        touched = [
            entry_path,
            entry_type_dir / "_index.md",
            log_path,
            store / "manifest.json",
        ]
        # Also stage any archived entries.
        for dupe in dupes:
            touched.append(store / dupe["path"])
        _git_commit_store(store, msg, touched)

    print(f"kb: saved  {fm['type']}/{filename}  id:{entry_id}")
    return 0


# ---------------------------------------------------------------------------
# Verb: validate
# ---------------------------------------------------------------------------

def cmd_validate(args: argparse.Namespace) -> int:
    store = resolve_store(args.store, interactive=not args.no_interactive)
    errors_found = False
    for md_file in sorted(store.rglob("*.md")):
        rel = md_file.relative_to(store)
        parts = rel.parts
        if parts[0] == _STORE_CONFIG_NAME:
            continue
        if md_file.name in ("log.md",) or md_file.name.startswith("_"):
            continue
        try:
            fm, _ = _read_entry(md_file)
        except Exception as exc:
            print(f"PARSE ERROR  {rel}: {exc}")
            errors_found = True
            continue
        errs = validate_entry(fm)
        if errs:
            errors_found = True
            for e in errs:
                print(f"INVALID  {rel}: {e}")
        else:
            print(f"ok  {rel}")
    return 1 if errors_found else 0


# ---------------------------------------------------------------------------
# Verb: stale
# ---------------------------------------------------------------------------

def cmd_stale(args: argparse.Namespace) -> int:
    store = resolve_store(args.store, interactive=not args.no_interactive)
    manifest = _load_manifest(store)
    now = datetime.datetime.now(datetime.timezone.utc)
    found_any = False
    for entry in manifest.get("entries", []):
        lv = entry.get("last_verified")
        ttl = entry.get("ttl")
        if not lv or not ttl:
            continue
        try:
            lv_dt = _parse_iso(lv)
            delta = _parse_ttl(ttl)
        except ValueError:
            continue
        if lv_dt.tzinfo is None:
            lv_dt = lv_dt.replace(tzinfo=datetime.timezone.utc)
        if lv_dt + delta < now:
            print(f"STALE  {entry.get('path')}  title={entry.get('title')!r}  last_verified={lv}  ttl={ttl}")
            found_any = True
    if not found_any:
        print("kb: no stale entries found")
    return 0


# ---------------------------------------------------------------------------
# Verb: doctor
# ---------------------------------------------------------------------------

def cmd_doctor(args: argparse.Namespace) -> int:
    store = resolve_store(args.store, interactive=not args.no_interactive)
    if not store.exists():
        print(f"MISSING store directory: {store}")
        return 1

    manifest = _load_manifest(store)
    manifest_ids = {e["id"] for e in manifest.get("entries", [])}
    issues: list[str] = []

    for md_file in sorted(store.rglob("*.md")):
        rel = md_file.relative_to(store)
        parts = rel.parts
        if parts[0] == _STORE_CONFIG_NAME:
            continue
        if md_file.name in ("log.md",) or md_file.name.startswith("_"):
            continue
        # Parse
        try:
            fm, body = _read_entry(md_file)
        except Exception as exc:
            issues.append(f"PARSE ERROR {rel}: {exc}")
            continue
        # Schema
        errs = validate_entry(fm)
        for e in errs:
            issues.append(f"SCHEMA {rel}: {e}")
        # Manifest presence
        entry_id = fm.get("id")
        if entry_id and entry_id not in manifest_ids:
            issues.append(f"MISSING FROM MANIFEST {rel}  id={entry_id}")
        # Broken relative links
        broken = _check_links(body, md_file.parent)
        for href in broken:
            issues.append(f"BROKEN LINK {rel}: {href!r}")
        # _index.md coverage
        index_path = md_file.parent / "_index.md"
        if index_path.exists():
            idx_text = index_path.read_text(encoding='utf-8')
            if md_file.name not in idx_text:
                issues.append(f"MISSING FROM INDEX {rel}")

    if issues:
        for issue in issues:
            print(issue)
        return 1
    print("kb: store is healthy")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="kb",
        description="Config-driven knowledge-save CLI (stdlib only).",
    )
    p.add_argument("--store", metavar="PATH", help="Override store path.")
    p.add_argument(
        "--no-interactive",
        action="store_true",
        help="Fail instead of prompting when no store is configured.",
    )

    sub = p.add_subparsers(dest="verb", required=True)

    # save
    sp = sub.add_parser("save", help="Save a knowledge entry.")
    sp.add_argument("--file", "-f", metavar="PATH", help="Read content from file (default: stdin).")
    sp.add_argument("--id", help="Entry ID (default: new UUID).")
    sp.add_argument("--type", default="fact", help="Entry type (default: fact).")
    sp.add_argument("--title", required=True, help="Entry title.")
    sp.add_argument("--description", help="One-sentence description.")
    sp.add_argument("--status", default="active", choices=["active", "reference", "archive"])
    sp.add_argument("--tags", default="", help="Comma-separated tags.")
    sp.add_argument("--ttl", help="Time-to-live, e.g. 90d (default: from store config).")
    sp.add_argument("--confidence", choices=["low", "medium", "high"])
    sp.add_argument("--provenance", default="human", choices=["agent", "human", "distilled"])
    sp.add_argument("--sources", nargs="*", metavar="URL", help="Source URLs.")

    # validate
    sub.add_parser("validate", help="Re-validate all entries against the schema.")

    # stale
    sub.add_parser("stale", help="List entries past their last_verified + ttl.")

    # doctor
    sub.add_parser("doctor", help="Report store health.")

    return p


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    dispatch = {
        "save": cmd_save,
        "validate": cmd_validate,
        "stale": cmd_stale,
        "doctor": cmd_doctor,
    }
    return dispatch[args.verb](args)


if __name__ == "__main__":
    sys.exit(main())

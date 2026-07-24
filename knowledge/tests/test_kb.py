"""Tests for knowledge/kb.py.

All tests use tempfile.TemporaryDirectory.  No real store, repo, or user config
is touched.  HOME and XDG env vars are overridden per test so config-resolution
never reads the actual user environment.
"""
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

# Allow imports from the knowledge package root.
KB_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(KB_DIR))

import kb  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fake_env(tmp_home: Path, extra: dict[str, str] | None = None) -> dict[str, str]:
    """Return a minimal env dict pointing HOME and XDG at tmp_home."""
    env: dict[str, str] = {
        "HOME": str(tmp_home),
        "XDG_CONFIG_HOME": str(tmp_home / "config"),
    }
    # Remove real store pointers so they don't bleed through.
    env.pop("AMANAR_KB_DIR", None)
    if extra:
        env.update(extra)
    return env


def _git_init_store(store: Path) -> None:
    """Initialise store as a bare git repo with config identity."""
    subprocess.run(["git", "init", "-q", str(store)], check=True)
    subprocess.run(["git", "config", "user.email", "test@kb.local"], cwd=store, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=store, check=True)


def _save_entry(
    store: Path,
    title: str = "Test entry",
    entry_type: str = "fact",
    tags: str = "x,y",
    content: str = "Some markdown content.\n",
    commit_policy: str = "auto",
    extra_args: list[str] | None = None,
) -> int:
    """Run kb.main() with save verb and return its exit code."""
    argv = [
        "--store", str(store),
        "--no-interactive",
        "save",
        "--title", title,
        "--type", entry_type,
        "--tags", tags,
        "--confidence", "high",
        "--provenance", "human",
        "--ttl", "30d",
    ] + (extra_args or [])

    import io
    old_stdin = sys.stdin
    sys.stdin = io.StringIO(content)
    try:
        code = kb.main(argv)
    finally:
        sys.stdin = old_stdin
    return code


# ---------------------------------------------------------------------------
# Config precedence tests
# ---------------------------------------------------------------------------

class TestConfigPrecedence(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_flag_beats_env(self):
        flag_store = self.base / "flag-store"
        env_store = self.base / "env-store"
        env_store.mkdir()
        resolved = kb.resolve_store(
            str(flag_store),
            interactive=False,
            env={**_fake_env(self.base), "AMANAR_KB_DIR": str(env_store)},
            cwd=self.base,
            home=self.base,
        )
        self.assertEqual(resolved, flag_store.resolve())

    def test_env_beats_project_dir(self):
        env_store = self.base / "env-store"
        env_store.mkdir()
        proj_store = self.base / "cwd" / ".knowledge"
        proj_store.mkdir(parents=True)
        resolved = kb.resolve_store(
            None,
            interactive=False,
            env={**_fake_env(self.base), "AMANAR_KB_DIR": str(env_store)},
            cwd=self.base / "cwd",
            home=self.base,
        )
        self.assertEqual(resolved, env_store.resolve())

    def test_project_dot_knowledge_beats_xdg(self):
        cwd = self.base / "project"
        proj_store = cwd / ".knowledge"
        proj_store.mkdir(parents=True)
        # XDG points somewhere else.
        xdg_cfg = self.base / "config" / "amanar"
        xdg_cfg.mkdir(parents=True)
        xdg_kb = xdg_cfg / "kb.yml"
        xdg_target = self.base / "xdg-store"
        xdg_target.mkdir()
        xdg_kb.write_text(f"store: {xdg_target}\n")
        resolved = kb.resolve_store(
            None,
            interactive=False,
            env=_fake_env(self.base),
            cwd=cwd,
            home=self.base,
        )
        self.assertEqual(resolved, proj_store.resolve())

    def test_project_kb_config_pointer(self):
        cwd = self.base / "project"
        (cwd / ".kb").mkdir(parents=True)
        pointed_store = self.base / "pointed-store"
        pointed_store.mkdir()
        (cwd / ".kb" / "config.yml").write_text(f"store: {pointed_store}\n")
        resolved = kb.resolve_store(
            None,
            interactive=False,
            env=_fake_env(self.base),
            cwd=cwd,
            home=self.base,
        )
        self.assertEqual(resolved, pointed_store.resolve())

    def test_xdg_config_fallback(self):
        xdg_cfg = self.base / "config" / "amanar"
        xdg_cfg.mkdir(parents=True)
        target = self.base / "xdg-store"
        target.mkdir()
        (xdg_cfg / "kb.yml").write_text(f"store: {target}\n")
        resolved = kb.resolve_store(
            None,
            interactive=False,
            env=_fake_env(self.base),
            cwd=self.base / "empty-cwd",
            home=self.base,
        )
        self.assertEqual(resolved, target.resolve())

    def test_no_config_non_interactive_errors(self):
        with self.assertRaises(SystemExit) as cm:
            kb.resolve_store(
                None,
                interactive=False,
                env=_fake_env(self.base),
                cwd=self.base / "empty",
                home=self.base,
            )
        self.assertNotEqual(cm.exception.code, 0)


# ---------------------------------------------------------------------------
# Secret scan tests
# ---------------------------------------------------------------------------

class TestSecretScan(unittest.TestCase):

    def test_clean_content_passes(self):
        self.assertEqual(kb._scan_secrets("This is a normal markdown note.\n"), [])

    def test_aws_akia_key_detected(self):
        text = "Use the key AKIAIOSFODNN7EXAMPLE for testing."
        findings = kb._scan_secrets(text)
        self.assertTrue(any("AWS" in f for f in findings), findings)

    def test_pem_private_key_detected(self):
        text = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
        findings = kb._scan_secrets(text)
        self.assertTrue(any("private key" in f.lower() for f in findings), findings)

    def test_password_assignment_detected(self):
        text = "config: password=supersecretvalue123\n"
        findings = kb._scan_secrets(text)
        self.assertTrue(any("credential" in f.lower() for f in findings), findings)

    def test_api_key_assignment_detected(self):
        text = "api_key=abc123defghijklmnopqrstuvwxyz"
        findings = kb._scan_secrets(text)
        self.assertTrue(any("credential" in f.lower() for f in findings), findings)

    def test_high_entropy_token_detected(self):
        # 40 chars of high-entropy base64-ish string
        text = "token: ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8"
        findings = kb._scan_secrets(text)
        # should catch high-entropy OR credential assignment
        self.assertTrue(len(findings) > 0, findings)

    def test_save_aborts_on_secret(self):
        with tempfile.TemporaryDirectory() as td:
            store = Path(td) / "store"
            store.mkdir()
            import io
            old_stdin = sys.stdin
            sys.stdin = io.StringIO("password=supersecret123 is here\n")
            try:
                code = kb.main([
                    "--store", str(store),
                    "--no-interactive",
                    "save",
                    "--title", "Bad entry",
                ])
            finally:
                sys.stdin = old_stdin
            self.assertNotEqual(code, 0)


# ---------------------------------------------------------------------------
# Schema validation tests
# ---------------------------------------------------------------------------

class TestSchemaValidation(unittest.TestCase):

    def _valid(self) -> dict:
        return {
            "id": "test-id-001",
            "type": "fact",
            "title": "Valid entry",
            "status": "active",
        }

    def test_valid_minimal_entry_passes(self):
        self.assertEqual(kb.validate_entry(self._valid()), [])

    def test_missing_required_id(self):
        fm = self._valid()
        del fm["id"]
        errors = kb.validate_entry(fm)
        self.assertTrue(any("id" in e for e in errors), errors)

    def test_missing_required_type(self):
        fm = self._valid()
        del fm["type"]
        errors = kb.validate_entry(fm)
        self.assertTrue(any("type" in e for e in errors), errors)

    def test_missing_required_title(self):
        fm = self._valid()
        del fm["title"]
        errors = kb.validate_entry(fm)
        self.assertTrue(any("title" in e for e in errors), errors)

    def test_missing_required_status(self):
        fm = self._valid()
        del fm["status"]
        errors = kb.validate_entry(fm)
        self.assertTrue(any("status" in e for e in errors), errors)

    def test_invalid_status_enum(self):
        fm = self._valid()
        fm["status"] = "deleted"
        errors = kb.validate_entry(fm)
        self.assertTrue(any("status" in e for e in errors), errors)

    def test_invalid_confidence_enum(self):
        fm = self._valid()
        fm["confidence"] = "ultra"
        errors = kb.validate_entry(fm)
        self.assertTrue(any("confidence" in e for e in errors), errors)

    def test_invalid_provenance_enum(self):
        fm = self._valid()
        fm["provenance"] = "robot"
        errors = kb.validate_entry(fm)
        self.assertTrue(any("provenance" in e for e in errors), errors)

    def test_invalid_ttl_format(self):
        fm = self._valid()
        fm["ttl"] = "two-weeks"
        errors = kb.validate_entry(fm)
        self.assertTrue(any("ttl" in e for e in errors), errors)

    def test_tags_not_list_fails(self):
        fm = self._valid()
        fm["tags"] = "tag1,tag2"
        errors = kb.validate_entry(fm)
        self.assertTrue(any("tags" in e for e in errors), errors)

    def test_full_valid_entry_passes(self):
        fm = {
            "id": "full-001",
            "type": "decision",
            "title": "Use stdlib only",
            "description": "Avoid third-party dependencies.",
            "status": "active",
            "tags": ["python", "stdlib"],
            "created": "2026-07-24T00:00:00Z",
            "last_verified": "2026-07-24T00:00:00Z",
            "ttl": "90d",
            "confidence": "high",
            "provenance": "human",
            "sources": [{"url": "https://example.com", "sha256": "", "ingested": "2026-07-24"}],
        }
        self.assertEqual(kb.validate_entry(fm), [])


# ---------------------------------------------------------------------------
# Frontmatter parser / serializer round-trip tests
# ---------------------------------------------------------------------------

class TestFrontmatterRoundtrip(unittest.TestCase):

    def _roundtrip(self, data: dict) -> dict:
        text = kb._serialize_frontmatter(data)
        fm_text, _ = kb._split_entry_text(text + "\n\nbody")
        return kb._parse_frontmatter(fm_text)

    def test_scalar_fields_roundtrip(self):
        data = {"id": "x", "type": "fact", "title": "My title", "status": "active"}
        rt = self._roundtrip(data)
        self.assertEqual(rt["id"], "x")
        self.assertEqual(rt["title"], "My title")
        self.assertEqual(rt["status"], "active")

    def test_tag_list_roundtrip(self):
        data = {"id": "x", "type": "fact", "title": "T", "status": "active", "tags": ["a", "b", "c"]}
        rt = self._roundtrip(data)
        self.assertEqual(rt["tags"], ["a", "b", "c"])

    def test_source_object_list_roundtrip(self):
        sources = [{"url": "https://ex.com", "sha256": "abc", "ingested": "2026-07-24"}]
        data = {"id": "x", "type": "fact", "title": "T", "status": "active", "sources": sources}
        rt = self._roundtrip(data)
        self.assertIsInstance(rt["sources"], list)
        self.assertEqual(len(rt["sources"]), 1)
        self.assertEqual(rt["sources"][0]["url"], "https://ex.com")
        self.assertEqual(rt["sources"][0]["sha256"], "abc")

    def test_empty_tags_roundtrip(self):
        data = {"id": "x", "type": "fact", "title": "T", "status": "active", "tags": []}
        rt = self._roundtrip(data)
        self.assertEqual(rt.get("tags"), [])

    def test_title_with_special_chars_roundtrip(self):
        data = {"id": "x", "type": "fact", "title": "Title: with colon", "status": "active"}
        rt = self._roundtrip(data)
        self.assertEqual(rt["title"], "Title: with colon")


# ---------------------------------------------------------------------------
# Dedup / archive-with-pointer tests
# ---------------------------------------------------------------------------

class TestDedup(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Path(self.tmp.name) / "store"
        self.store.mkdir()
        _git_init_store(self.store)
        kb._ensure_store(self.store)

    def tearDown(self):
        self.tmp.cleanup()

    def _save(self, title: str, tags: str = "", content: str = "Body.\n") -> int:
        return _save_entry(self.store, title=title, tags=tags, content=content)

    def test_first_save_succeeds(self):
        code = self._save("Unique title A")
        self.assertEqual(code, 0)

    def test_duplicate_title_archives_old(self):
        # First save
        self._save("Dedup target")
        manifest = kb._load_manifest(self.store)
        self.assertEqual(len(manifest["entries"]), 1)
        old_path = self.store / manifest["entries"][0]["path"]

        # Second save with same title
        self._save("Dedup target")
        # Old entry should now be archived
        fm, body = kb._read_entry(old_path)
        self.assertEqual(fm.get("status"), "archive")
        self.assertIn("superseded", body)

        # New entry should be active
        manifest2 = kb._load_manifest(self.store)
        active = [e for e in manifest2["entries"] if e["status"] != "archive"]
        self.assertEqual(len(active), 1)

    def test_overlapping_tags_archives_old(self):
        self._save("Entry one", tags="ml,python")
        manifest = kb._load_manifest(self.store)
        old_path = self.store / manifest["entries"][0]["path"]

        self._save("Entry two", tags="python,stdlib")
        fm, _ = kb._read_entry(old_path)
        self.assertEqual(fm.get("status"), "archive")

    def test_non_overlapping_saves_both_active(self):
        self._save("Entry alpha", tags="golang")
        self._save("Entry beta", tags="rust")
        manifest = kb._load_manifest(self.store)
        active = [e for e in manifest["entries"] if e.get("status") != "archive"]
        self.assertEqual(len(active), 2)


# ---------------------------------------------------------------------------
# Full save-into-temp-git-store integration test
# ---------------------------------------------------------------------------

class TestFullSaveIntegration(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Path(self.tmp.name) / "knowledge-store"
        self.store.mkdir()
        _git_init_store(self.store)

    def tearDown(self):
        self.tmp.cleanup()

    def test_save_creates_expected_files(self):
        code = _save_entry(
            self.store,
            title="Integration test entry",
            entry_type="decision",
            tags="test,integration",
            content="This documents an important decision.\n",
        )
        self.assertEqual(code, 0)

        # Entry file exists inside <type>/ (exclude _index.md)
        type_dir = self.store / "decision"
        md_files = [f for f in type_dir.glob("*.md") if not f.name.startswith("_")]
        self.assertEqual(len(md_files), 1)

        # Frontmatter is parseable and correct
        fm, body = kb._read_entry(md_files[0])
        self.assertEqual(fm["type"], "decision")
        self.assertEqual(fm["title"], "Integration test entry")
        self.assertIn("test", fm.get("tags", []))
        self.assertEqual(fm["status"], "active")

        # _index.md lists the entry
        index_path = type_dir / "_index.md"
        self.assertTrue(index_path.exists())
        self.assertIn(md_files[0].name, index_path.read_text())

        # log.md has a log line
        log = (self.store / "log.md").read_text()
        self.assertIn("Integration test entry", log)

        # manifest.json has the entry
        manifest = kb._load_manifest(self.store)
        self.assertEqual(len(manifest["entries"]), 1)
        entry_meta = manifest["entries"][0]
        self.assertEqual(entry_meta["title"], "Integration test entry")
        self.assertEqual(entry_meta["type"], "decision")

    def test_save_commits_to_store_git(self):
        _save_entry(self.store, title="Git commit test", content="Content.\n")

        # There should be at least one commit in the store.
        result = subprocess.run(
            ["git", "log", "--oneline"],
            cwd=self.store,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0)
        self.assertGreater(len(result.stdout.strip()), 0)
        self.assertIn("kb:", result.stdout)

    def test_manifest_json_is_valid_json(self):
        _save_entry(self.store, title="JSON manifest check", content="Body.\n")
        manifest_path = self.store / "manifest.json"
        self.assertTrue(manifest_path.exists())
        data = json.loads(manifest_path.read_text())
        self.assertIn("entries", data)
        self.assertIsInstance(data["entries"], list)

    def test_save_from_file_arg(self):
        content_file = Path(self.tmp.name) / "entry.md"
        content_file.write_text("Content from a file.\n")
        code = kb.main([
            "--store", str(self.store),
            "--no-interactive",
            "save",
            "--title", "File-sourced entry",
            "--type", "reference",
            "--file", str(content_file),
        ])
        self.assertEqual(code, 0)
        type_dir = self.store / "reference"
        md_files = [f for f in type_dir.glob("*.md") if not f.name.startswith("_")]
        self.assertEqual(len(md_files), 1)
        _, body = kb._read_entry(md_files[0])
        self.assertIn("Content from a file", body)

    def test_validate_verb_passes_on_clean_store(self):
        _save_entry(self.store, title="Validate test", content="Body.\n")
        code = kb.main([
            "--store", str(self.store),
            "--no-interactive",
            "validate",
        ])
        self.assertEqual(code, 0)

    def test_stale_verb_runs_without_error(self):
        _save_entry(self.store, title="Stale test", content="Body.\n")
        code = kb.main([
            "--store", str(self.store),
            "--no-interactive",
            "stale",
        ])
        self.assertEqual(code, 0)

    def test_doctor_verb_passes_on_healthy_store(self):
        _save_entry(self.store, title="Doctor test", content="Body.\n")
        code = kb.main([
            "--store", str(self.store),
            "--no-interactive",
            "doctor",
        ])
        self.assertEqual(code, 0)


# ---------------------------------------------------------------------------
# Stale detection unit tests
# ---------------------------------------------------------------------------

class TestStaleParsing(unittest.TestCase):

    def test_ttl_days(self):
        delta = kb._parse_ttl("90d")
        self.assertEqual(delta.days, 90)

    def test_ttl_months(self):
        delta = kb._parse_ttl("6m")
        self.assertEqual(delta.days, 180)

    def test_ttl_years(self):
        delta = kb._parse_ttl("1y")
        self.assertEqual(delta.days, 365)

    def test_invalid_ttl_raises(self):
        with self.assertRaises(ValueError):
            kb._parse_ttl("two-weeks")


# ---------------------------------------------------------------------------
# Gitleaks defense-in-depth tests
# ---------------------------------------------------------------------------

class TestGitleaksDefenseInDepth(unittest.TestCase):

    def test_gitleaks_absent_is_noop(self):
        """When gitleaks is not on PATH, _run_gitleaks_check returns [] (no-op)."""
        with unittest.mock.patch("kb.shutil.which", return_value=None):
            findings = kb._run_gitleaks_check(Path("/fake/store"))
        self.assertEqual(findings, [])

    def test_gitleaks_clean_scan_returns_empty(self):
        """When gitleaks is present and exits 0, _run_gitleaks_check returns []."""
        clean_result = subprocess.CompletedProcess(
            args=["gitleaks", "detect"],
            returncode=0,
            stdout="",
            stderr="",
        )
        with unittest.mock.patch("kb.shutil.which", return_value="/usr/bin/gitleaks"), \
             unittest.mock.patch("kb.subprocess.run", return_value=clean_result):
            findings = kb._run_gitleaks_check(Path("/fake/store"))
        self.assertEqual(findings, [])

    def test_gitleaks_found_secrets_returns_findings(self):
        """When gitleaks exits non-zero, _run_gitleaks_check returns a non-empty list."""
        dirty_result = subprocess.CompletedProcess(
            args=["gitleaks", "detect"],
            returncode=1,
            stdout="WRN secret leaked: AWS access key at line 3\n",
            stderr="",
        )
        with unittest.mock.patch("kb.shutil.which", return_value="/usr/bin/gitleaks"), \
             unittest.mock.patch("kb.subprocess.run", return_value=dirty_result):
            findings = kb._run_gitleaks_check(Path("/fake/store"))
        self.assertGreater(len(findings), 0)
        self.assertTrue(any("gitleaks" in f for f in findings))

    def test_gitleaks_found_secrets_aborts_save(self):
        """When _run_gitleaks_check returns findings, cmd_save aborts with non-zero exit."""
        with tempfile.TemporaryDirectory() as td:
            store = Path(td) / "store"
            store.mkdir()
            _git_init_store(store)

            # Monkeypatch _run_gitleaks_check on the kb module to simulate findings.
            with unittest.mock.patch.object(
                kb,
                "_run_gitleaks_check",
                return_value=["gitleaks: leaked AWS key at fact/entry.md:1"],
            ):
                code = _save_entry(store, title="Gitleaks abort test", content="Safe content.\n")

            self.assertNotEqual(code, 0)

    def test_gitleaks_absent_save_succeeds(self):
        """When gitleaks is absent, save completes normally (no hard dependency)."""
        with tempfile.TemporaryDirectory() as td:
            store = Path(td) / "store"
            store.mkdir()
            _git_init_store(store)

            with unittest.mock.patch("kb.shutil.which", return_value=None):
                code = _save_entry(store, title="No gitleaks test", content="Normal content.\n")

            self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()

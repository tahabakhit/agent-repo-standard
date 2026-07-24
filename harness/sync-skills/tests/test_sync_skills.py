import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

SYNC = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SYNC))

import sync_skills  # noqa: E402

STAMP = "20260724T000000Z"


class SyncSkillsTestCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        base = Path(self.temporary.name)
        self.homes = {}
        self._saved = {}
        for host, (var, default) in sync_skills.HOSTS.items():
            home = base / default
            home.mkdir(parents=True)
            self.homes[host] = home
            self._saved[var] = os.environ.get(var)
            os.environ[var] = str(home)
        self.sources = sync_skills.discover_sources()

    def tearDown(self):
        for var, value in self._saved.items():
            if value is None:
                os.environ.pop(var, None)
            else:
                os.environ[var] = value
        self.temporary.cleanup()

    def test_discovers_the_amanar_skills(self):
        self.assertIn("amanar-workflow", self.sources)
        self.assertIn("amanar-scaffold", self.sources)
        self.assertTrue(all(name.startswith("amanar-") for name in self.sources))

    def test_dry_run_makes_no_changes(self):
        actions = sync_skills.plan(self.sources, ["pi"], True, False)
        self.assertTrue(any(a["op"] == "link" for a in actions))
        self.assertFalse(any((self.homes["pi"] / "skills").glob("*")))

    def test_apply_links_all_skills_into_each_host(self):
        actions = sync_skills.plan(self.sources, ["pi", "codex", "claude"], True, False)
        sync_skills.apply(actions, STAMP)
        for host in ("pi", "codex", "claude"):
            skills = self.homes[host] / "skills"
            for name, source in self.sources.items():
                link = skills / name
                self.assertTrue(link.is_symlink(), f"{host}:{name}")
                self.assertEqual(os.readlink(link), str(source))

    def test_supersede_backs_up_overlapping_personal_skill(self):
        old = self.homes["pi"] / "skills" / "codebase-design"
        old.mkdir(parents=True)
        (old / "SKILL.md").write_text("legacy\n")
        actions = sync_skills.plan(self.sources, ["pi"], True, False)
        self.assertTrue(any(a["op"] == "supersede" and a["path"] == str(old) for a in actions))
        sync_skills.apply(actions, STAMP)
        self.assertFalse(old.exists())
        backup = self.homes["pi"] / "skills" / "backups" / f"sync-skills-{STAMP}" / "codebase-design"
        self.assertTrue(backup.is_dir())
        self.assertTrue((self.homes["pi"] / "skills" / "amanar-design").is_symlink())

    def test_no_supersede_leaves_personal_skill(self):
        old = self.homes["pi"] / "skills" / "codebase-design"
        old.mkdir(parents=True)
        actions = sync_skills.plan(self.sources, ["pi"], False, False)
        self.assertFalse(any(a["op"] == "supersede" for a in actions))

    def test_remove_unlinks_only_our_symlinks(self):
        sync_skills.apply(sync_skills.plan(self.sources, ["pi"], True, False), STAMP)
        sync_skills.apply(sync_skills.plan(self.sources, ["pi"], True, True), STAMP)
        skills = self.homes["pi"] / "skills"
        self.assertFalse(any(link.is_symlink() for link in skills.glob("amanar-*")))

    def test_refuses_symlinked_skills_dir(self):
        skills = self.homes["codex"] / "skills"
        skills.symlink_to(self.homes["codex"])
        actions = sync_skills.plan(self.sources, ["codex"], True, False)
        self.assertTrue(any(a["op"] == "refuse" for a in actions))

    def test_missing_host_home_is_skipped(self):
        os.environ["CLAUDE_HOME"] = str(Path(self.temporary.name) / "absent")
        actions = sync_skills.plan(self.sources, ["claude"], True, False)
        self.assertTrue(any(a["op"] == "skip-host" for a in actions))


if __name__ == "__main__":
    unittest.main()

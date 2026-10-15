import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


builder = module("builder", ROOT / "scripts/build.py")
hook = module("hook", ROOT / "automation/portfolio-curator/scripts/hook.py")


class HookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cfg = {"repo": str(ROOT), "drafts_dir": self.temp.name + "/drafts", "state_dir": self.temp.name + "/state"}

    def event(self, name, **kwargs):
        return {"session_id": "session-a", "turn_id": "turn-1", "hook_event_name": name, **kwargs}

    def test_backend_work_does_not_request_continuation(self):
        hook.handle(self.event("UserPromptSubmit", prompt="修复数据库连接"), self.cfg)
        self.assertEqual(hook.handle(self.event("Stop", last_assistant_message="数据库测试通过"), self.cfg), {})

    def test_ui_edit_requests_evaluation_once_but_does_not_publish(self):
        hook.handle(self.event("PostToolUse", tool_name="apply_patch", tool_input={"command": "*** Update File: src/App.tsx"}), self.cfg)
        response = hook.handle(self.event("Stop"), self.cfg)
        self.assertEqual(response["decision"], "block")
        self.assertEqual(hook.handle(self.event("Stop"), self.cfg), {})
        self.assertFalse(Path(self.cfg["drafts_dir"]).exists())

    def test_read_only_ui_inspection_is_not_marked_as_an_edit(self):
        hook.handle(self.event("PostToolUse", tool_name="Bash", tool_input={"command": "cat src/App.tsx"}), self.cfg)
        self.assertEqual(hook.handle(self.event("Stop"), self.cfg), {})

    def test_ack_and_continuation_guard(self):
        hook.handle(self.event("UserPromptSubmit", prompt="设计一个页面"), self.cfg)
        self.assertEqual(hook.handle(self.event("Stop", stop_hook_active=True), self.cfg), {})
        with hook.state(self.cfg, "session-a", "turn-1") as state:
            state["outcome"] = "proposed"
        self.assertEqual(hook.handle(self.event("Stop"), self.cfg), {})

    def test_sessions_and_turns_do_not_share_receipts(self):
        with hook.state(self.cfg, "session-a", "turn-1") as state:
            state["outcome"] = "skipped"
        response = hook.handle(self.event("Stop", session_id="session-b", last_assistant_message="页面已完成"), self.cfg)
        self.assertEqual(response["decision"], "block")
        response = hook.handle(self.event("Stop", turn_id="turn-2", last_assistant_message="页面已完成"), self.cfg)
        self.assertEqual(response["decision"], "block")

    def test_plan_mode_does_not_start_extra_work(self):
        self.assertEqual(hook.handle(self.event("Stop", permission_mode="plan", last_assistant_message="组件计划"), self.cfg), {})

    def test_claude_prompt_ids_cover_edits_receipts_and_later_prompts(self):
        base = {"session_id": "claude-session", "prompt_id": "prompt-one"}
        start = hook.handle({"session_id": "claude-session", "hook_event_name": "SessionStart"}, self.cfg)
        self.assertEqual(start["hookSpecificOutput"]["hookEventName"], "SessionStart")
        prompt = hook.handle({**base, "hook_event_name": "UserPromptSubmit", "prompt": "修复显示问题"}, self.cfg)
        self.assertIn("prompt-one", prompt["hookSpecificOutput"]["additionalContext"])
        hook.handle({**base, "hook_event_name": "PostToolUse", "tool_name": "Write",
                     "tool_input": {"file_path": "/tmp/component.tsx", "content": "export default () => null"}}, self.cfg)
        stop = {**base, "hook_event_name": "Stop", "last_assistant_message": "Done"}
        self.assertEqual(hook.handle(stop, self.cfg)["decision"], "block")
        self.assertEqual(hook.handle(stop, self.cfg), {})
        with hook.state(self.cfg, "claude-session", "prompt-one") as state:
            state["outcome"] = "proposed"
        self.assertEqual(hook.handle(stop, self.cfg), {})
        next_stop = {**stop, "prompt_id": "prompt-two", "last_assistant_message": "页面已完成"}
        self.assertEqual(hook.handle(next_stop, self.cfg)["decision"], "block")

    def test_claude_subagent_cannot_mark_parent_for_curation(self):
        base = {"session_id": "claude-session", "prompt_id": "prompt-one"}
        hook.handle({**base, "hook_event_name": "PostToolUse", "agent_id": "child",
                     "tool_name": "Edit", "tool_input": {"file_path": "/tmp/demo.html"}}, self.cfg)
        self.assertEqual(hook.handle({**base, "hook_event_name": "Stop"}, self.cfg), {})


class InstallerTests(unittest.TestCase):
    def test_claude_install_preserves_other_settings_and_hooks(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            repo, home = root / "repo", root / "claude"
            (repo / "works").mkdir(parents=True)
            (repo / "works/README.md").write_text("Works")
            home.mkdir()
            original = {"model": "existing-model", "enabledPlugins": {"existing": True},
                        "disableAllHooks": True, "hooks": {"PreToolUse": [{"hooks": [{"type": "command", "command": "echo existing"}]}]}}
            (home / "settings.json").write_text(json.dumps(original))
            (home / "CLAUDE.md").write_text("Existing user preferences.\n")
            cmd = [sys.executable, str(ROOT / "automation/install.py"), "--repo", str(repo),
                   "--client", "claude", "--claude-home", str(home)]
            subprocess.run(cmd, check=True, capture_output=True)
            subprocess.run(cmd, check=True, capture_output=True)
            installed = json.loads((home / "settings.json").read_text())
            self.assertEqual({k: v for k, v in installed.items() if k != "hooks"},
                             {k: v for k, v in original.items() if k != "hooks"})
            self.assertEqual(installed["hooks"]["PreToolUse"], original["hooks"]["PreToolUse"])
            for event in ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop"]:
                self.assertEqual(len(installed["hooks"][event]), 1)
            self.assertTrue((home / "CLAUDE.md").read_text().startswith("Existing user preferences.\n"))
            self.assertEqual((home / "CLAUDE.md").read_text().count("<!-- portfolio-curator:start -->"), 1)
            self.assertFalse((home / "AGENTS.md").exists())
            cfg = json.loads((home / "skills/portfolio-curator/config.json").read_text())
            self.assertEqual(cfg["state_dir"], str(repo.parent / ".portfolio-curator/state/claude"))
            self.assertEqual(cfg["drafts_dir"], str(repo.parent / ".portfolio-curator/drafts"))

    def test_preserves_existing_config_and_does_not_write_trust(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            repo = root / "repo"
            (repo / "works").mkdir(parents=True)
            (repo / "works/README.md").write_text("Works")
            home = root / "codex"
            home.mkdir()
            original = {"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "echo original"}]}]}, "description": "keep me"}
            (home / "hooks.json").write_text(json.dumps(original))
            (home / "AGENTS.md").write_text("Keep tmux.\n")
            (home / "config.toml").write_text('model = "existing-model"\n')
            cmd = [sys.executable, str(ROOT / "automation/install.py"), "--repo", str(repo), "--codex-home", str(home)]
            subprocess.run(cmd, check=True, capture_output=True)
            subprocess.run(cmd, check=True, capture_output=True)
            installed = json.loads((home / "hooks.json").read_text())
            self.assertEqual(installed["description"], "keep me")
            self.assertEqual(len(installed["hooks"]["Stop"]), 2)
            self.assertEqual(installed["hooks"]["Stop"][0], original["hooks"]["Stop"][0])
            self.assertTrue((home / "AGENTS.md").read_text().startswith("Keep tmux.\n"))
            self.assertEqual((home / "AGENTS.md").read_text().count("<!-- portfolio-curator:start -->"), 1)
            self.assertEqual((home / "config.toml").read_text(), 'model = "existing-model"\n')
            self.assertTrue((home / "skills/portfolio-curator/SKILL.md").exists())
            self.assertEqual(len(list((home / "portfolio-curator-backups").iterdir())), 2)
            event = {"hook_event_name": "SessionStart", "session_id": "test"}
            result = subprocess.run([sys.executable, str(home / "skills/portfolio-curator/scripts/hook.py")], input=json.dumps(event), text=True, capture_output=True, check=True)
            self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["hookEventName"], "SessionStart")


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / "site", self.root / "site")
        (self.root / "works").mkdir()

    def work(self):
        folder = self.root / "works/test-component"
        (folder / "src").mkdir(parents=True)
        (folder / "src/index.html").write_text("<button>Test fixture only</button>")
        (folder / "README.md").write_text("Test fixture only")
        # A tiny PNG. Test assets never enter the published repository's works/.
        import base64
        (folder / "preview.png").write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII="))
        info = {"title": "<script>alert(1)</script>", "summary": "A test fixture", "kind": "component", "date": "2026-10-15", "tags": ["HTML"], "highlights": ["Small"], "preview": "preview.png", "demo": None}
        (folder / "work.json").write_text(json.dumps(info))
        return folder, info

    def test_empty_site_builds_without_invented_works(self):
        self.assertEqual(builder.build(self.root), 0)
        page = (self.root / "_site/index.html").read_text()
        self.assertIn('class="empty"', page)
        self.assertNotIn('data-kind=', page)

    def test_approved_work_renders_and_only_public_assets_are_copied(self):
        folder, info = self.work()
        (folder / ".env").write_text("PRIVATE_FIXTURE=never-copy")
        (folder / "demo").mkdir()
        (folder / "demo/index.html").write_text('<link rel="stylesheet" href="style.css">')
        (folder / "demo/style.css").write_text("*{overscroll-behavior:none}")
        info["demo"] = "demo/index.html"
        (folder / "work.json").write_text(json.dumps(info))
        self.assertEqual(builder.build(self.root), 1)
        page = (self.root / "_site/index.html").read_text()
        self.assertIn("&lt;script&gt;", page)
        self.assertNotIn("<script>alert", page)
        self.assertTrue((self.root / "_site/demos/test-component/style.css").exists())
        self.assertFalse((self.root / "_site/works").exists())
        self.assertEqual(list((self.root / "_site").rglob(".env")), [])

    def test_bad_paths_and_demo_urls_fail_before_replacing_output(self):
        folder, info = self.work()
        builder.build(self.root)
        page = (self.root / "_site/index.html").read_text()
        for change in [{"preview": "../../site/index.html"}, {"demo": "javascript:alert(1)"}, {"kind": "unknown"}]:
            with self.subTest(change=change):
                (folder / "work.json").write_text(json.dumps({**info, **change}))
                with self.assertRaises(ValueError):
                    builder.build(self.root)
                self.assertEqual((self.root / "_site/index.html").read_text(), page)

    def test_demo_rejects_symlinks_and_hidden_files(self):
        folder, info = self.work()
        (folder / "demo").mkdir()
        (folder / "demo/index.html").write_text("demo")
        (folder / "demo/.env").write_text("private")
        info["demo"] = "demo/index.html"
        (folder / "work.json").write_text(json.dumps(info))
        with self.assertRaises(ValueError):
            builder.build(self.root)
        (folder / "demo/.env").unlink()
        (folder / "demo/leak").symlink_to(self.root / "site")
        with self.assertRaises(ValueError):
            builder.build(self.root)


if __name__ == "__main__":
    unittest.main()

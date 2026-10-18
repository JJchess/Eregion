import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


builder = module("builder", ROOT / "scripts/build.py")
preview = module("preview", ROOT / "scripts/serve.py")
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

    def work(self, slug="test-component", day=15):
        folder = self.root / "works" / slug
        (folder / "src").mkdir(parents=True)
        (folder / "src/index.html").write_text("<button>Test fixture only</button>")
        (folder / "README.md").write_text("Test fixture only")
        # Synthetic assets live only in this temporary directory.
        import base64
        (folder / "preview.png").write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII="))
        info = {"title": "<script>alert(1)</script>", "summary": "A test fixture", "kind": "component", "date": f"2026-10-{day:02d}", "tags": ["HTML"], "highlights": ["Small"], "preview": "preview.png", "demo": None}
        (folder / "work.json").write_text(json.dumps(info))
        return folder, info

    def page(self, path="index.html"):
        return (self.root / "_site" / path).read_text()

    def test_empty_site_builds_both_languages_without_invented_works(self):
        self.assertEqual(builder.build(self.root), 0)
        expected = {"index.html", "about/index.html", "projects/index.html", "404.html"}
        expected |= {"zh/" + path for path in expected.copy()}
        actual = {str(path.relative_to(self.root / "_site")) for path in (self.root / "_site").rglob("*.html")}
        self.assertEqual(actual, expected)
        for prefix, lang in [("", "en"), ("zh/", "zh-CN")]:
            for route in ["index.html", "projects/index.html"]:
                page = self.page(prefix + route)
                self.assertIn(f'<html lang="{lang}">', page)
                self.assertIn('class="empty"', page)
                self.assertIn("<sup>00</sup>", page)
                self.assertNotIn('data-kind=', page)
                self.assertNotIn('data-filter=', page)
                self.assertNotIn('<dialog', page)
        self.assertFalse((self.root / "_site/projects/test-component").exists())

    def test_site_allowlist_publishes_assets_but_not_inputs_or_private_files(self):
        (self.root / "site/.env").write_text("PRIVATE_FIXTURE=never-copy")
        (self.root / "site/private-notes.txt").write_text("not public")
        builder.build(self.root)
        output = self.root / "_site"
        for asset in builder.SITE_FILES:
            self.assertEqual((output / asset).read_bytes(), (self.root / "site" / asset).read_bytes())
        for private in [".env", "private-notes.txt", "profile.json", "copy.json", "templates", "replicas"]:
            self.assertFalse((output / private).exists(), private)

    def test_legacy_work_has_real_bilingual_detail_and_escaped_original_content(self):
        folder, info = self.work()
        info["summary"] = '<img src=x onerror="alert(1)">'
        info["highlights"] = ['<script>bad()</script>']
        (folder / "work.json").write_text(json.dumps(info))
        self.assertEqual(builder.load_works(self.root)[0]["locale"], "zh")
        builder.build(self.root)
        for prefix in ["", "zh/"]:
            page = self.page(prefix + "projects/test-component/index.html")
            self.assertIn('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;', page)
            self.assertIn('&lt;script&gt;bad()&lt;/script&gt;', page)
            self.assertNotIn("<img src=x", page)
            self.assertNotIn("<script>alert", page)
            self.assertNotIn('class="next-project"', page)
            self.assertNotIn('href="None"', page)
            self.assertIn("https://github.com/JJchess/Eregion/tree/main/works/test-component", page)
        self.assertIn('class="original-language"', self.page("projects/test-component/index.html"))
        self.assertNotIn('class="original-language"', self.page("zh/projects/test-component/index.html"))
        home = self.page()
        self.assertIn('href="/portfolio/projects/test-component/"', home)
        self.assertIn('<h3 lang="zh-CN">', home)
        self.assertIn("<sup>01</sup>", home)
        self.assertNotIn('<dialog', home)

    def test_translation_is_optional_per_field_and_does_not_invent_missing_copy(self):
        folder, info = self.work()
        info.update(locale="en", title="Original title", summary="Original summary",
                    translations={"zh": {"title": "中文标题", "summary": "中文简介", "tags": ["界面"], "highlights": ["中文亮点"]}})
        (folder / "work.json").write_text(json.dumps(info))
        builder.build(self.root)
        english = self.page("projects/test-component/index.html")
        chinese = self.page("zh/projects/test-component/index.html")
        self.assertIn("Original title", english)
        self.assertNotIn("中文标题", english)
        self.assertIn("中文标题", chinese)
        self.assertIn("中文简介", chinese)
        self.assertNotIn('class="original-language"', chinese)
        info["translations"]["zh"] = {"title": "中文标题"}
        (folder / "work.json").write_text(json.dumps(info))
        builder.build(self.root)
        chinese = self.page("zh/projects/test-component/index.html")
        self.assertIn("Original summary", chinese)
        self.assertIn('class="original-language"', chinese)
        item = builder.localize_work(builder.load_works(self.root)[0], "zh")
        self.assertEqual(item["content_languages"]["summary"], "en")
        self.assertEqual(item["content_languages"]["title"], "zh")

    def test_language_links_preserve_current_route_and_asset_base(self):
        self.work()
        builder.build(self.root, base_path="/preview/")
        page = self.page("projects/test-component/index.html")
        self.assertIn('href="/preview/zh/projects/test-component/"', page)
        self.assertIn('src="/preview/media/test-component/preview.png"', page)
        self.assertIn('src="/preview/app.js"', page)
        self.assertIn('href="https://jjchess.github.io/Eregion/projects/test-component/"', page)
        self.assertIn('hreflang="zh-CN" href="https://jjchess.github.io/Eregion/zh/projects/test-component/"', page)
        self.assertIn('href="/preview/projects/test-component/"', self.page("zh/projects/test-component/index.html"))

    def test_pages_deployment_base_matches_actual_repository_path(self):
        folder, info = self.work()
        (folder / "demo").mkdir()
        (folder / "demo/index.html").write_text("Static demo")
        info["demo"] = "demo/index.html"
        (folder / "work.json").write_text(json.dumps(info))
        # configure-pages supplies a base_path without the trailing slash.
        self.assertEqual(builder.build(self.root, base_path="/Eregion"), 1)
        for locale in ["", "zh/"]:
            page = self.page(locale + "projects/test-component/index.html")
            self.assertIn('data-base="/Eregion/"', page)
            self.assertIn('src="/Eregion/app.js"', page)
            self.assertIn('src="/Eregion/media/test-component/preview.png"', page)
            self.assertIn('href="/Eregion/demos/test-component/"', page)
            self.assertIn('href="https://github.com/JJchess/Eregion/tree/main/works/test-component"', page)
            self.assertIn(f'href="https://jjchess.github.io/Eregion/{locale}projects/test-component/"', page)
            language = "zh" if locale else "en"
            self.assertIn(f'href="/Eregion/demos/test-component/?lang={language}"', self.page(locale + "projects/index.html"))
            self.assertNotIn('/portfolio/', page)
        self.assertIn('href="/Eregion/zh/projects/test-component/"', self.page("projects/test-component/index.html"))
        self.assertIn('href="/Eregion/projects/test-component/"', self.page("zh/projects/test-component/index.html"))
        # Local development deliberately keeps the historical preview prefix.
        builder.build(self.root)
        self.assertIn('data-base="/portfolio/"', self.page())
        self.assertIn('href="https://jjchess.github.io/Eregion/"', self.page())

    def test_home_limits_to_six_but_archive_and_next_links_use_all_real_works(self):
        for i in range(7):
            self.work(f"fixture-{i}", day=i + 1)
        self.assertEqual(builder.build(self.root), 7)
        home, archive = self.page(), self.page("projects/index.html")
        self.assertEqual(home.count('class="work" data-kind='), 6)
        self.assertEqual(archive.count('class="work" data-kind='), 7)
        self.assertNotIn('href="/portfolio/projects/fixture-0/"', home)
        self.assertIn('href="/portfolio/projects/fixture-0/"', archive)
        self.assertLess(archive.index("projects/fixture-6/"), archive.index("projects/fixture-5/"))
        self.assertIn('class="next-project" href="/portfolio/projects/fixture-5/"', self.page("projects/fixture-6/index.html"))
        self.assertIn('class="next-project" href="/portfolio/zh/projects/fixture-6/"', self.page("zh/projects/fixture-0/index.html"))

    def test_unsafe_frontend_asset_preserves_last_successful_build(self):
        builder.build(self.root)
        original = self.page()
        asset = self.root / "site/app.js"
        asset.unlink()
        secret = self.root / "private.js"
        secret.write_text("not public")
        asset.symlink_to(secret)
        with self.assertRaises(ValueError):
            builder.build(self.root)
        self.assertEqual(self.page(), original)

    def test_approved_work_copies_only_preview_and_opted_in_static_demo(self):
        folder, info = self.work()
        (folder / ".env").write_text("PRIVATE_FIXTURE=never-copy")
        (folder / "demo").mkdir()
        (folder / "demo/index.html").write_text('<link rel="stylesheet" href="style.css">')
        (folder / "demo/style.css").write_text("*{overscroll-behavior:none}")
        info["demo"] = "demo/index.html"
        (folder / "work.json").write_text(json.dumps(info))
        self.assertEqual(builder.build(self.root), 1)
        for prefix in ["", "zh/"]:
            self.assertIn('class="pill" href="/portfolio/demos/test-component/"', self.page(prefix + "projects/test-component/index.html"))
        self.assertTrue((self.root / "_site/demos/test-component/style.css").exists())
        self.assertFalse((self.root / "_site/works").exists())
        self.assertEqual(list((self.root / "_site").rglob(".env")), [])

    def test_bad_paths_urls_and_translations_preserve_previous_output(self):
        folder, info = self.work()
        builder.build(self.root)
        original = self.page()
        changes = [
            {"preview": "../../site/index.html"}, {"demo": "javascript:alert(1)"},
            {"demo": "https://name:password@example.com"}, {"kind": "unknown"},
            {"locale": "fr"}, {"translations": []}, {"translations": {"fr": {}}},
            {"translations": {"en": {"preview": "elsewhere.png"}}},
            {"translations": {"en": {"title": ""}}}, {"translations": {"en": {"tags": "HTML"}}},
        ]
        for change in changes:
            with self.subTest(change=change):
                (folder / "work.json").write_text(json.dumps({**info, **change}))
                with self.assertRaises(ValueError):
                    builder.build(self.root)
                self.assertEqual(self.page(), original)

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

    def test_undefined_template_token_fails_without_replacing_output(self):
        builder.build(self.root)
        original = self.page()
        path = self.root / "site/templates/home.html"
        path.write_text(path.read_text() + "{{missing_copy_key}}")
        with self.assertRaisesRegex(ValueError, "missing_copy_key"):
            builder.build(self.root)
        self.assertEqual(self.page(), original)
        self.assertEqual(builder.render("{{value}}", {"value": "{{literal_user_text}}"}), "{{literal_user_text}}")

    def test_failed_final_rename_restores_previous_build(self):
        builder.build(self.root)
        original = self.page()
        rename = Path.rename

        def fail_publish(path, target):
            if path.name == "output" and Path(target).name == "_site":
                raise OSError("Simulated publication failure")
            return rename(path, target)

        with mock.patch.object(Path, "rename", fail_publish):
            with self.assertRaisesRegex(OSError, "publication failure"):
                builder.build(self.root)
        self.assertEqual(self.page(), original)

    def test_invalid_base_path_and_output_symlink_are_rejected(self):
        for base in ["https://example.com/", "/../", "/portfolio/?x=1", "/a\\b/"]:
            with self.subTest(base=base):
                with self.assertRaises(ValueError):
                    builder.build(self.root, base_path=base)
        destination = self.root / "outside"
        destination.mkdir()
        (self.root / "_site").symlink_to(destination, target_is_directory=True)
        with self.assertRaises(ValueError):
            builder.build(self.root)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "public"
        self.root.mkdir()
        for path, text in {
            "index.html": "HOME", "about/index.html": "ABOUT",
            "projects/index.html": "PROJECTS", "projects/real-work/index.html": "REAL WORK",
            "zh/index.html": "中文首页", "zh/about/index.html": "关于",
            "zh/projects/real-work/index.html": "中文作品",
            "404.html": "NOT FOUND", "zh/404.html": "未找到页面",
            "media/clip.mp4": "0123456789",
        }.items():
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(text)

    def request(self, path, method="GET", headers=None):
        # Exercise the production handler without opening a port or server.
        handler_type = preview.make_handler(self.root)
        handler = handler_type.__new__(handler_type)
        handler.path = path
        handler.headers = headers or {}
        handler.wfile = io.BytesIO()
        result = {"headers": {}}
        handler.send_response = lambda status: result.update(status=status)
        handler.send_header = lambda key, value: result["headers"].update({key: value})
        handler.end_headers = lambda: None
        handler.send_error = lambda status: result.update(status=status)
        handler.respond(method != "HEAD")
        return {**result, "body": handler.wfile.getvalue()}

    def test_root_and_directory_redirects_keep_the_deployment_prefix(self):
        self.assertEqual(self.request("/")["headers"]["Location"], "/portfolio/")
        self.assertEqual(self.request("/")["status"], 302)
        self.assertEqual(self.request("/portfolio")["status"], 301)
        redirect = self.request("/portfolio/about?mode=test")
        self.assertEqual(redirect["status"], 301)
        self.assertEqual(redirect["headers"]["Location"], "/portfolio/about/?mode=test")
        self.assertEqual(self.request("/portfolio-other/")["status"], 404)

    def test_real_routes_refresh_without_an_api_or_spa_fallback(self):
        for route in ["", "about/", "projects/", "projects/real-work/", "zh/", "zh/about/", "zh/projects/real-work/"]:
            with self.subTest(route=route):
                self.assertEqual(self.request("/portfolio/" + route)["status"], 200)
        for path in ["/portfolio/projects/imaginary/", "/api/reference", "/__reference/media.png", "/portfolio/missing.js"]:
            result = self.request(path)
            self.assertEqual(result["status"], 404)
            self.assertEqual(result["body"], b"NOT FOUND")
        self.assertEqual(self.request("/portfolio/zh/missing/")["body"], b"NOT FOUND")
        self.assertEqual(self.request("/portfolio/zh/404.html")["body"].decode(), "未找到页面")

    def test_private_traversal_symlinks_and_directory_listing_are_unavailable(self):
        secret = self.root.parent / "secret.txt"
        secret.write_text("PRIVATE")
        (self.root / "leak.txt").symlink_to(secret)
        (self.root / "cycle").symlink_to(self.root / "cycle")
        (self.root / "nested").symlink_to(self.root.parent, target_is_directory=True)
        (self.root / ".env").write_text("PRIVATE")
        (self.root / "empty").mkdir()
        for path in ["../secret.txt", "%2e%2e/secret.txt", "%2e%2e%2fsecret.txt",
                     ".env", "leak.txt", "cycle", "nested/secret.txt", "empty/"]:
            with self.subTest(path=path):
                result = self.request("/portfolio/" + path)
                self.assertEqual(result["status"], 404)
                self.assertNotIn(b"PRIVATE", result["body"])
        self.assertEqual(self.request("/portfolio/%00")["status"], 400)

    def test_head_and_video_ranges_match_static_file_semantics(self):
        result = self.request("/portfolio/media/clip.mp4", method="HEAD")
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["body"], b"")
        self.assertEqual(result["headers"]["Content-Length"], "10")
        result = self.request("/portfolio/media/clip.mp4", headers={"Range": "bytes=2-5"})
        self.assertEqual(result["status"], 206)
        self.assertEqual(result["body"], b"2345")
        self.assertEqual(result["headers"]["Content-Range"], "bytes 2-5/10")
        result = self.request("/portfolio/media/clip.mp4", headers={"Range": "bytes=-3"})
        self.assertEqual(result["body"], b"789")
        for value in ["bytes=20-", "bytes=5-2", "bytes=-0", "bytes=1-2,4-5"]:
            self.assertEqual(self.request("/portfolio/media/clip.mp4", headers={"Range": value})["status"], 416)


if __name__ == "__main__":
    unittest.main()

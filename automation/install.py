#!/usr/bin/env python3
"""Install only this skill and merge its four hooks, leaving trust to Codex."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys

START = "<!-- portfolio-curator:start -->"
END = "<!-- portfolio-curator:end -->"


def make_plan(repo, codex_home):
    target = codex_home / "skills" / "portfolio-curator"
    command = shlex.join([sys.executable, str(target / "scripts" / "hook.py")])
    hooks_file = codex_home / "hooks.json"
    hooks = json.loads(hooks_file.read_text()) if hooks_file.exists() else {}
    if not isinstance(hooks, dict) or not isinstance(hooks.get("hooks", {}), dict):
        raise ValueError("Existing hooks.json is not a hooks object")
    for event in ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop"]:
        groups = hooks.setdefault("hooks", {}).setdefault(event, [])
        # Replace only our own definition. Retain other handlers in shared groups.
        retained = []
        for group in groups:
            group = dict(group)
            group["hooks"] = [h for h in group.get("hooks", [])
                              if h.get("statusMessage") != "Portfolio curator"]
            if group["hooks"]:
                retained.append(group)
        own = {"hooks": [{"type": "command", "command": command, "timeout": 3,
                          "statusMessage": "Portfolio curator"}]}
        if event == "PostToolUse":
            own["matcher"] = "^(apply_patch|Edit|Write|Bash)$"
        hooks["hooks"][event] = retained + [own]
    local = repo.parent / ".portfolio-curator"
    cfg = {"repo": str(repo), "drafts_dir": str(local / "drafts"), "state_dir": str(local / "state")}
    agents_file = codex_home / "AGENTS.md"
    agents = agents_file.read_text() if agents_file.exists() else ""
    block = f"""{START}
## UI 作品收录

- 在 Codex 开发过程中留意值得展示的 UI 组件、页面和交互；先完成当前任务。
- 自主发现时，先整理可预览候选，再询问用户是否收录；没有明确同意，不提交、不 push、不公开。
- 用户明确说「收录这个」「加入 portfolio」或同意已展示候选时，直接完成整理、验证、commit、push 和页面同步，不重复确认。
- 目标为 `git@github.com:JJchess/portfolio.git`，本机路径 `{repo}`；源码放 `works/<slug>/src/`，写 README、真实预览和 work.json，由同仓库生成网页。
- 需要整理时读取 `{target / 'SKILL.md'}`。未确认候选保存在 `{local / 'drafts'}`；普通修复不必收录，不反复询问已拒绝作品。
{END}"""
    if START in agents or END in agents:
        if agents.count(START) != 1 or agents.count(END) != 1 or agents.index(START) > agents.index(END):
            raise ValueError("Malformed existing portfolio instruction markers")
        agents = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, agents, flags=re.S)
    else:
        agents = agents.rstrip() + "\n\n" + block + "\n"
    return target, cfg, hooks, agents


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--codex-home", type=Path, default=Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    repo, home = args.repo.resolve(), args.codex_home.expanduser().resolve()
    if not (repo / "works" / "README.md").is_file():
        parser.error("--repo must point to the prepared portfolio checkout")
    target, cfg, hooks, agents = make_plan(repo, home)
    if args.dry_run:
        print(json.dumps({"skill": str(target), "config": cfg, "hooks_file": str(home / "hooks.json"),
                          "hooks": hooks, "agents_file": str(home / "AGENTS.md"), "agents": agents}, ensure_ascii=False, indent=2))
        return
    home.mkdir(parents=True, exist_ok=True)
    backup = home / "portfolio-curator-backups" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup.mkdir(parents=True)
    for name in ["hooks.json", "AGENTS.md", "portfolio-curator.json"]:
        if (home / name).exists():
            shutil.copy2(home / name, backup / name)
    if target.exists():
        shutil.copytree(target, backup / "skill", symlinks=True)
    shutil.copytree(Path(__file__).parent / "portfolio-curator", target, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for name, data in [("hooks.json", hooks), ("portfolio-curator.json", cfg)]:
        (home / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    (target / "config.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n")
    (home / "AGENTS.md").write_text(agents)
    for key in ["drafts_dir", "state_dir"]:
        Path(cfg[key]).mkdir(parents=True, exist_ok=True)
    print(json.dumps({"installed": str(target), "backup": str(backup), "next": "Review and trust the four new hooks using /hooks in Codex."}, ensure_ascii=False))


if __name__ == "__main__":
    main()

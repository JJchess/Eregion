#!/usr/bin/env python3
"""Local Codex/Claude Code reminders: no source copying, network or publishing."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys

SKILL = Path(__file__).resolve().parents[1]
UI_SIGNAL = re.compile(
    r"(?i)(\b(?:ui|ux|frontend|portfolio|css|webgl|animation|component|landing|figma)\b"
    r"|界面|页面|组件|交互|动效|动画|作品集|收录|前端|视觉|落地页)"
)
UI_FILE = re.compile(r"(?i)\.(?:tsx|jsx|vue|svelte|html|css|scss|sass|less)(?:\b|$)")
EDIT = re.compile(r"(?i)(apply_patch|write_text|write_bytes|writeFile|\bsed\s+-i|\btee\b|\bcp\s|\bmv\s|(?<![<=>])>{1,2}(?![=]))")


def config():
    path = Path(os.environ.get("PORTFOLIO_CURATOR_CONFIG", SKILL / "config.json"))
    return json.loads(path.read_text())


def state_path(cfg, session, turn):
    key = hashlib.sha256(f"{session}\0{turn}".encode()).hexdigest()
    return Path(cfg["state_dir"]) / (key + ".json")


@contextmanager
def state(cfg, session, turn):
    path = state_path(cfg, session, turn)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix(".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = json.loads(path.read_text()) if path.exists() else {}
        yield data
        temp = path.with_suffix(f".{os.getpid()}.tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False))
        temp.replace(path)


def context(cfg, event):
    # Quote every dynamic argument, including event identifiers.
    import shlex
    command = shlex.join([
        sys.executable, str(Path(__file__).resolve()), "ack",
        "--session", event.get("session_id", ""),
        "--turn", event.get("turn_id", ""), "--outcome", "OUTCOME",
    ])
    return (
        "用户的 portfolio 偏好：当前开发任务完成后，留意值得展示的 UI 成果。"
        "自主发现时先整理本地候选和真实预览，再询问用户；未明确同意不得提交或公开。"
        "用户明确说‘收录这个/加入 portfolio’或同意已展示候选，则直接完成整理和发布，不重复确认。"
        "普通修复、没有亮点或用户不愿收录时跳过。候选判断由你结合上下文完成，不能只看文件名。"
        f"需要收录时读取 {SKILL / 'SKILL.md'}；目标是 JJchess/portfolio，"
        f"本机仓库 {cfg['repo']}，草稿 {cfg['drafts_dir']}。"
        "不要因为这个提示打断主任务或自动启动其他 AI 会话。"
        + (f" 本轮处理后执行回执（OUTCOME 替换为 skipped/proposed/deferred/published）：{command}"
           if event.get("turn_id") else "")
    )


def handle(event, cfg):
    # Claude Code uses prompt_id; Codex uses turn_id. Keep receipts per prompt.
    if event.get("agent_id"):
        return {}  # Subagent events must not overwrite the main session's receipt.
    event = {**event, "turn_id": event.get("turn_id") or event.get("prompt_id") or ""}
    name = event.get("hook_event_name")
    session, turn = event.get("session_id"), event.get("turn_id")
    if name == "SessionStart":
        return {"hookSpecificOutput": {"hookEventName": name, "additionalContext": context(cfg, event)}}
    if not session or not turn:
        return {}
    if name == "UserPromptSubmit":
        with state(cfg, session, turn) as current:
            current["ui"] = current.get("ui", False) or bool(UI_SIGNAL.search(event.get("prompt", "")))
        return {"hookSpecificOutput": {"hookEventName": name, "additionalContext": context(cfg, event)}}
    if name == "PostToolUse":
        tool = event.get("tool_name", "")
        inp = event.get("tool_input", {})
        raw = inp if isinstance(inp, str) else json.dumps(inp, ensure_ascii=False)
        # Read operations do not count. Signals request an evaluation, never publication.
        edited = tool in {"apply_patch", "Edit", "MultiEdit", "Write"} or (tool == "Bash" and EDIT.search(raw))
        if edited and UI_FILE.search(raw):
            with state(cfg, session, turn) as current:
                current["ui"] = True
        return {}
    if name != "Stop" or event.get("stop_hook_active") or event.get("permission_mode") == "plan":
        return {}
    with state(cfg, session, turn) as current:
        if current.get("outcome") or current.get("nudged"):
            return {}
        if not current.get("ui") and not UI_SIGNAL.search(event.get("last_assistant_message") or ""):
            return {}
        current["nudged"] = True
    return {
        "decision": "block",
        "reason": (
            "Portfolio hook 提醒一次：本轮可能有 UI 成果。先判断当前任务是否已完成及是否有值得展示的作品；"
            "没有就记录 skipped 并结束，不要为了收录制造新任务。已经询问过就记录 proposed，不重复询问。"
            "有候选且尚未获准时先准备可审阅草稿，然后询问用户，绝不自动 push。 " + context(cfg, event)
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="action")
    ack = sub.add_parser("ack")
    ack.add_argument("--session", required=True)
    ack.add_argument("--turn", required=True)
    ack.add_argument("--outcome", choices=["skipped", "proposed", "deferred", "published"], required=True)
    args = parser.parse_args()
    try:
        cfg = config()
        if args.action == "ack":
            with state(cfg, args.session, args.turn) as current:
                current["outcome"] = args.outcome
            print(json.dumps({"recorded": args.outcome}))
            return
        event = json.load(sys.stdin)
        if not isinstance(event, dict):
            raise ValueError("Hook input must be an object")
        print(json.dumps(handle(event, cfg), ensure_ascii=False))
    except Exception as error:
        # A broken curation reminder must never prevent the user's primary work.
        if args.action == "ack":
            print(f"Portfolio receipt failed: {type(error).__name__}", file=sys.stderr)
            sys.exit(1)
        print(json.dumps({"systemMessage": f"Portfolio hook 未执行：{type(error).__name__}。当前任务可继续。"}, ensure_ascii=False))


if __name__ == "__main__":
    main()

# JJchess · Portfolio

在 Codex 中把想法做成界面，把值得留下的界面整理成作品。

[浏览作品集](https://JJchess.github.io/portfolio/) · [作品源码](works/) · [Codex 收录技能](automation/portfolio-curator/SKILL.md)

## 作品怎样进入这里

1. 在任意项目继续正常开发。Codex 会留意有展示价值的组件、页面和交互。
2. Codex 主动发现时，先整理本地候选，给出真实预览、收录理由和公开范围，询问是否收录。
3. 用户同意，或直接说「把这个收录到 portfolio」后，Codex 整理源码和 README，验证后提交到本仓库。
4. GitHub Actions 从作品资料构建并发布网页。源码和网页使用同一份资料。

未确认的候选保存在仓库外，不会被提交。Hook 负责提醒和防遗漏，作品质量与适用性由当前 Codex 会话结合开发上下文判断。Hook 本身不启动第二个 AI 进程，也不会执行 Git push。

## 仓库结构

```text
works/<slug>/
  work.json       # 标题、简介、类别、日期、亮点、预览与演示路径
  README.md       # 作品说明、运行方式、交互、来源和验证情况
  src/            # 整理后的源码与必要依赖清单、锁文件
  preview.webp    # 实际作品截图（也支持 PNG / JPEG）
  demo/           # 可选，可独立访问的静态演示
site/             # 展示页模板、样式、筛选交互
scripts/build.py  # 验证作品资料并生成静态站点
automation/       # 可安装到 Codex 的收录技能与 hooks
```

没有默认授权为所有作品选定开源许可证。每件作品保留其实际来源和适用许可；需要新授权决定时单独确认。

## 本地预览

需要 Python 3.10+，无需安装依赖。

```bash
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 -m http.server 4173 --directory _site
```

打开 `http://localhost:4173`。构建只输出页面、已收录作品预览及明确指定的静态演示，不会把整个工作区打包上网。

## 安装 Codex 收录流程

```bash
python3 automation/install.py --repo "$PWD"
```

当前安装器适用于 macOS / Linux。安装器向 `~/.codex/skills/portfolio-curator` 安装技能，在 `~/.codex/hooks.json` 合并 hooks，并向全局 `AGENTS.md` 追加这项用户偏好；保留已有内容。安装前会备份被修改的文件。运行 `--dry-run` 可查看准确的路径和 hooks 定义。

随后在 Codex CLI 输入 `/hooks`，审阅并信任新 hooks，再新建或恢复会话。这是 Codex 对非托管 hooks 的原生要求；安装器不会替你写入信任记录。

使用 `SessionStart` / `UserPromptSubmit` 注入收录约定，`PostToolUse` 捕捉 UI 编辑信号，`Stop` 在可能遗漏时提醒一次，并有防重复标记。UI 信号是启发式提示，不保证发现每件作品；任何时候都可以明确说「收录这个」。原生 hooks 适用于支持本地 hooks 的 Codex 环境，其他设备需分别安装。

本地配置在 `~/.codex/portfolio-curator.json`，候选和运行状态默认放在本仓库旁的 `.portfolio-curator/`。候选保留到人工处理，不执行自动删除，也不触碰 tmux。

停用时可以在 `/hooks` 禁用本技能的四个 hooks，并移除全局 `AGENTS.md` 的 `portfolio-curator` 标记段；不影响其他 hooks。

## 安装 Claude Code 全局收录流程

```bash
python3 automation/install.py --client claude --repo "$PWD"
```

安装到 `~/.claude/skills/portfolio-curator/`，向 `~/.claude/settings.json` 合并四个 hooks，并在 `~/.claude/CLAUDE.md` 中记录收录约定。保留已有 hooks、模型、插件及其他设置，修改前自动备份。设置了 `CLAUDE_CONFIG_DIR` 时使用该目录，也可通过 `--claude-home` 指定。

新开一个 Claude Code 会话即可加载完整上下文，输入 `/hooks` 可检查全局条目，或使用 `/portfolio-curator` 明确调用技能。收录规则与 Codex 相同：自主发现先准备候选并询问，明确要求收录则直接完成发布。仓库和草稿目录共用，回执状态独立；适配 Claude Code 的 `prompt_id`、`Write` / `Edit` / `Bash` 事件，并忽略子代理事件对主会话的干扰。

停用时从 `settings.json` 移除 `statusMessage` 为 `Portfolio curator` 的四个处理器，并删除 `CLAUDE.md` 的对应标记段。不要删除其他 hooks，也不自动修改已有的 `disableAllHooks` 设置。

参考：[Codex hooks](https://learn.chatgpt.com/docs/hooks)、[Claude Code hooks](https://code.claude.com/docs/en/hooks)、[GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

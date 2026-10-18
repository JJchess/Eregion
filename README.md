# JJchess · Portfolio

JJchess's personal site and approved UI archive. Build ideas into interfaces with Codex or Claude Code, then keep the work worth revisiting.

[English site](https://jjchess.github.io/Eregion/) · [中文站](https://jjchess.github.io/Eregion/zh/) · [GitHub](https://github.com/JJchess/Eregion) · [作品源码](works/) · [收录技能](automation/portfolio-curator/SKILL.md)

## Local preview

Python 3.10+; no Python packages to install. Build the static output, then serve the same `_site` directory used by GitHub Pages:

```bash
python3 scripts/build.py
python3 scripts/serve.py --port 4179
```

Open `http://localhost:4179/portfolio/` for English or `http://localhost:4179/portfolio/zh/` for Chinese. This preserves the established local preview address. The production site uses `/Eregion/`; GitHub Actions passes that base path to the same builder. To inspect the production path locally, use `python3 scripts/build.py --base-path /Eregion/` and `python3 scripts/serve.py --port 4179 --base-path /Eregion/` together.

The personal site includes Home, About, Projects and individual pages generated for approved works. Its light palette, large typography and original four-part UI installation are shared across both languages. Native controls provide the interaction; optional Three.js rendering adds decoration. Approved works include [Galaxy Skill Market](works/galaxy-skill-market/README.md), a navigable pearl-like skill map, and [Voice Mode UI](works/voice-mode-ui/README.md), a chat voice dock with progressive text and a procedural orb. Both use synthetic data and standalone demos. Empty states remain available when a filter has no matching works.

[Edumanus Landing Page](works/edumanus-landing/README.md) adds the complete AI Cosmos homepage: an interactive galaxy, five recorded product demonstrations, scroll-driven typography and an isometric image field. Its bilingual standalone demo opens directly from the work card. Login and registration are local presentation controls; the archive does not connect to the product backend.

The personal site, Galaxy Skill Market and Voice Mode UI are validated locally with official Google Chrome 155. GitHub Actions builds and publishes the approved archive through Pages; see the [design and verification record](docs/homepage-design.md) and each work's README for their separate tested scopes and remaining device-test limits.

## 个人站与作品资料

在 Codex 或 Claude Code 中把想法做成界面，把值得留下的界面整理成作品。首页的原创 UI 装置可以拆开体验四个组件，再重新组合；它是站点交互，不自动算作已收录作品。

英文是默认语言，中文有独立 URL。`work.json` 是作品展示资料的唯一来源，列表、计数、分类和真实作品详情均由它生成。新条目使用英文主字段、`locale: "en"` 和完整的 `translations.zh`；旧条目没有 `locale` 时按中文兼容。源码、预览和 demo 两种语言共用，完整约定见 [works/README.md](works/README.md)。

`replicas/lusion/` 保留原站本地研究版，和公开个人站分开。个人站构建只取明确允许的前端资源和获准作品，不发布 `replicas/`，也不依赖仓库外的研究缓存。

## 作品怎样进入这里

1. 在任意项目继续正常开发。Codex 或 Claude Code 会留意有展示价值的组件、页面和交互。
2. 代理主动发现时，先整理本地候选，给出真实预览、收录理由和公开范围，询问是否收录。
3. 用户同意，或直接说「把这个收录到 portfolio」后，代理整理源码、双语资料和 README，验证后 commit、push 到本仓库，不重复确认同一授权。
4. GitHub Actions 从作品资料构建并发布网页。源码和网页使用同一份资料。

未确认的候选保存在仓库外，不会被提交。Hook 负责提醒和防遗漏，作品质量与适用性由当前会话结合开发上下文判断。Hook 本身不启动第二个 AI 进程，也不会执行 Git push。用户只要求草稿或暂不发布时，遵循该范围。

## 仓库结构

```text
works/<slug>/
  work.json       # 共享资料、主语言和中英文展示字段
  README.md       # 作品说明、运行方式、交互、来源和验证情况
  src/            # 整理后的源码与必要依赖清单、锁文件
  preview.webp    # 实际作品截图（也支持 PNG / JPEG）
  demo/           # 可选，可独立访问的静态演示
site/             # 原创个人站界面、自产素材与固定版本的前端依赖
scripts/build.py  # 验证作品资料并生成双语静态站点
scripts/serve.py  # 在 /portfolio/ 子路径预览 _site
automation/       # 可安装到 Codex / Claude Code 的收录技能与 hooks
replicas/         # 本地研究版，不进入公开构建
```

没有默认授权为所有作品选定开源许可证。每件作品保留其实际来源和适用许可；需要新授权决定时单独确认。

## 验证与发布边界

运行 `python3 -m unittest discover -s tests -v` 检查构建与收录流程，再构建站点。浏览器验收使用真实 Chrome，检查桌面、手机尺寸、组件操作、语言切换、详情直达、键盘、减少动态效果和资源加载失败。测试夹具应留在系统临时目录，不进入作品归档。具体已完成的验证以 [设计记录](docs/homepage-design.md) 为准。

可选浏览器检查连接到已经运行、开放 CDP 9224 端口的官方 Chrome；需要可用的 Playwright 包。检查脚本不会启动或关闭 Chrome，测试服务器和作品夹具独立创建并清理：

```bash
CDP_PORT=9224 PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser.cjs
```

语音模式的独立回归连接同一官方 Chrome；先保持上方 4179 本地预览运行，再从仓库根目录执行：

```bash
CDP_PORT=9224 PLAYWRIGHT_MODULE=/path/to/playwright node tests/voice-browser.cjs
```

根页面和独立滚动容器保持 `overscroll-behavior: none`，内容仍可原生滚动。浏览器自动化不能替代物理手机或触控板的弹性滚动实测。Three.js 和字体随站点托管，版本与许可证见设计记录。

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

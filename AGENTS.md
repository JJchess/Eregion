# Portfolio

这是 JJchess 的公开作品集，源码与展示页使用同一仓库。

- 用户明确要求收录某个作品时，完成整理、验证、commit、push 和部署核实。
- Codex 自主发现候选时，先在仓库外整理可审阅的候选，展示预览、收录理由和将公开的文件范围，再询问用户。未收到明确同意，不得将候选复制到本仓库、提交或 push。沉默不是同意。
- 每件作品放在 `works/<slug>/`，包括 `src/`、`README.md`、`work.json` 和真实预览图。独立演示按需放 `demo/`。
- `work.json` 是展示资料的唯一来源；运行 `python3 scripts/build.py` 生成页面，不手工维护第二份作品列表。
- 不为填充页面编造作品、成绩、客户或履历。参考或改编作品保留来源、许可证及真实贡献说明。
- 提交前运行 `python3 -m unittest discover -s tests -v` 和 `python3 scripts/build.py`；只暂存本次相关文件，不使用 `git add .`、强推或自动 stash。
- 根页面和所有独立滚动容器设置 `overscroll-behavior: none`，保留正常滚动、键盘及输入体验。报告原生触控板／手机弹性滚动未实测的限制。
- 永远保留 tmux 服务器、客户端和会话。

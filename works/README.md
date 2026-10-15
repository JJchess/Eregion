# 作品归档

每个目录代表一个已经获准公开的作品。不要把尚未确认的候选放进这里。

`work.json` 示例（示例不是已收录作品）：

```json
{
  "title": "作品名称",
  "summary": "用一句话说明它让人能做什么，以及最值得看的设计细节。",
  "kind": "component",
  "date": "2026-10-15",
  "tags": ["React", "交互设计"],
  "highlights": ["具体的交互亮点", "具体的设计取舍"],
  "preview": "preview.webp",
  "demo": null
}
```

- 目录名是唯一 slug，使用小写字母、数字和连字符。
- `kind` 为 `component`、`page` 或 `experiment`。
- `preview` 是本作品目录内真实截图的相对路径，支持 `.png`、`.jpg`、`.jpeg`、`.webp`。
- `demo` 为 `null`、真实的 HTTPS 演示链接，或 `demo/index.html`。本地演示需包含全部静态依赖，使用相对路径，适配 GitHub Pages 子路径。
- `src/` 必须有实际源码；提取完整依赖闭包、必要静态资源和锁文件，去除业务密钥、私人数据和无关项目文件。
- README 写清：用途、截图、设计与交互亮点、技术栈、准确运行命令、验证结果、当前限制，以及参考来源／许可／自己的贡献。不将未执行的验证写成通过。
- 响应式作品验证桌面和手机尺寸；根页面与所有滚动容器使用 `overscroll-behavior: none`，原生弹性滚动未实测时注明。

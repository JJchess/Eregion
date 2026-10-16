# 作品归档

每个目录代表一个已经获准公开的作品。同一个作品只维护一份源码和元数据，由构建器生成英文、中文展示页。不要把尚未确认的候选放进这里；空归档保持真实的零作品状态。

`work.json` 示例（示例不是已收录作品）：

```json
{
  "locale": "en",
  "title": "Work title",
  "summary": "Explain what people can do and which interaction is worth exploring.",
  "kind": "component",
  "date": "2026-10-15",
  "tags": ["React", "Interaction design"],
  "highlights": ["A specific interaction detail", "A concrete design decision"],
  "preview": "preview.webp",
  "demo": null,
  "translations": {
    "zh": {
      "title": "作品名称",
      "summary": "说明它让人能做什么，以及最值得体验的交互细节。",
      "tags": ["React", "交互设计"],
      "highlights": ["具体的交互亮点", "具体的设计取舍"]
    }
  }
}
```

## 双语内容契约

- 原有必填字段保持不变：`title`、`summary`、`kind`、`date`、`tags`、`highlights`、`preview`。`demo` 可省略或为 `null`。
- `locale` 可选，支持 `en`、`zh`，表示主字段的语言。旧条目没有 `locale` 时按 `zh` 读取，无需为了兼容重新整理源码或改目录名。
- `translations.en` 和 `translations.zh` 为可选覆盖对象，只翻译 `title`、`summary`、`tags`、`highlights`。展示某语言时逐字段使用相应翻译；缺失字段回退到主字段，不自动编造译文。
- 新收录统一使用 `locale: "en"` 和英文主字段，并提供完整的 `translations.zh` 四个字段。技术名称可以保留原名；两种语言表达同一组事实，不添加未经确认的效果或成绩。
- `kind`、`date`、`preview`、`demo`、目录 slug 和 `src/` 共用，不放进翻译对象，也不为语言复制作品。预览与静态演示只维护一份。
- `title`、`summary` 是非空字符串；`tags`、`highlights` 是字符串数组，翻译字段遵循相同类型。日期使用 `YYYY-MM-DD`。
- 作品 README 可以按 English／中文分节，共用安装命令、验证结果和来源说明。网页内容仍以 `work.json` 为唯一来源。

## 文件与验证

- 目录名是唯一 slug，使用小写字母、数字和连字符。
- `kind` 为 `component`、`page` 或 `experiment`。
- `preview` 是本作品目录内真实截图的相对路径，支持 `.png`、`.jpg`、`.jpeg`、`.webp`。
- `demo` 为 `null`、真实的 HTTPS 演示链接，或 `demo/index.html`。本地演示需包含全部静态依赖，使用相对路径，适配 GitHub Pages 子路径。
- `src/` 必须有实际源码；提取完整依赖闭包、必要静态资源和锁文件，去除业务密钥、私人数据和无关项目文件。
- README 写清：用途、截图、设计与交互亮点、技术栈、准确运行命令、验证结果、当前限制，以及参考来源／许可／自己的贡献。不将未执行的验证写成通过。
- 响应式作品验证桌面和手机尺寸；根页面与所有滚动容器使用 `overscroll-behavior: none`，原生弹性滚动未实测时注明。

# Voice Mode UI — third-party notices

These notices cover the adapted orb renderer and third-party packages used by the demo. Complete license texts are in the accompanying `licenses/` directory. They do not grant a blanket license to the Edumanus application source.

## beUI Voice Orb

- Upstream: [starc007/ui-components — Voice Orb](https://github.com/starc007/ui-components/tree/9deb728d936b5f89c859ab6c1f169235aa24b3ad/components/agents/voice-orb).
- Revision: `9deb728d936b5f89c859ab6c1f169235aa24b3ad`; upstream file `components/agents/voice-orb/renderer.ts`.
- Copyright (c) 2026 Saurabh Chauhan.
- MIT: [complete retained text](licenses/beui-voice-orb-MIT.txt), checked against the [upstream license at that revision](https://github.com/starc007/ui-components/blob/9deb728d936b5f89c859ab6c1f169235aa24b3ad/LICENSE).

Edumanus adapts this renderer and records local changes with `edumanus:` comments, including continuous RGB palette blending and a steadier outline during voice activity. Its React shell, speaker mapping and chat integration are documented in the [work README](https://github.com/JJchess/Eregion/blob/main/works/voice-mode-ui/README.md). Preserve the source attribution and complete MIT notice when redistributing the adapted renderer.

## Direct runtime dependencies

License texts are copied unchanged from the corresponding installed/published package versions.

| Package | Version | License and attribution | Complete text |
| --- | --- | --- | --- |
| React | 19.2.1 | MIT; Meta Platforms, Inc. and affiliates | [react-19.2.1.txt](licenses/react-19.2.1.txt) |
| React DOM | 19.2.1 | MIT; Meta Platforms, Inc. and affiliates | [react-dom-19.2.1.txt](licenses/react-dom-19.2.1.txt) |
| Framer Motion | 12.38.0 | MIT; © 2018 Framer B.V. | [framer-motion-12.38.0.txt](licenses/framer-motion-12.38.0.txt) |
| Lucide React | 0.522.0 | ISC; Lucide Contributors 2022; includes Feather portions © Cole Bemis 2013–2022 under MIT | [lucide-react-0.522.0.txt](licenses/lucide-react-0.522.0.txt) |
| use-intl | 4.13.2 | MIT; © 2024 Jan Amann | [use-intl-4.13.2.txt](licenses/use-intl-4.13.2.txt) |
| Geist, distributed by Fontsource | @fontsource-variable/geist 5.3.0 | SIL OFL 1.1; © 2024 The Geist Project Authors | [fontsource-variable-geist-5.3.0.txt](licenses/fontsource-variable-geist-5.3.0.txt) |

Geist is locally hosted and unmodified. The orb is procedural native WebGL: it does not require a third-party texture, environment map, model or audio asset.

## Bundled transitive dependencies

The build records rendered JavaScript packages by name and version in `demo/bundled-packages.json`. Its 12-package inventory includes the applicable direct dependencies above and these transitive dependencies; the locally hosted Geist font and adapted beUI shader are covered separately above. Versions and full license text were checked against the installed lockfile.

| Package | Version | License and attribution | Complete text |
| --- | --- | --- | --- |
| @formatjs/fast-memoize | 3.1.7 | MIT; © 2023 FormatJS | [formatjs-fast-memoize-3.1.7.txt](licenses/formatjs-fast-memoize-3.1.7.txt) |
| @formatjs/icu-messageformat-parser | 3.5.18 | MIT; © 2023 FormatJS | [formatjs-icu-messageformat-parser-3.5.18.txt](licenses/formatjs-icu-messageformat-parser-3.5.18.txt) |
| @formatjs/icu-skeleton-parser | 2.1.11 | MIT; © 2023 FormatJS | [formatjs-icu-skeleton-parser-2.1.11.txt](licenses/formatjs-icu-skeleton-parser-2.1.11.txt) |
| intl-messageformat | 11.2.15 | BSD-3-Clause; © 2023 Oath Inc. | [intl-messageformat-11.2.15.txt](licenses/intl-messageformat-11.2.15.txt) |
| motion-dom | 12.43.0 | MIT; © 2024 Motion B.V. | [motion-dom-12.43.0.txt](licenses/motion-dom-12.43.0.txt) |
| motion-utils | 12.39.0 | MIT; © 2024 Motion B.V. | [motion-utils-12.39.0.txt](licenses/motion-utils-12.39.0.txt) |
| scheduler | 0.27.0 | MIT; Meta Platforms, Inc. and affiliates | [scheduler-0.27.0.txt](licenses/scheduler-0.27.0.txt) |

The build copies this notice and all 14 complete license files into `demo/`, so the static deployment carries the same notices as the source archive. Preserve these files when redistributing the demo. Build tools are specified in the source manifest and lockfile; their executable code is not shipped to the browser.

## Application and excluded material

The source product was reviewed at Edumanus HEAD `b4df0c289de7cfd39fe39e6d555bd317e665c1aa`. It did not provide a root license for all application code; this archive does not assign one. Third-party permissions above continue to apply to their respective portions.

The earlier `voice` prototype's ElevenLabs-derived material is not used. Its reference videos, source comparison images and audio behavior are not distributed. No production audio, chat transcript, microphone capture, voice-room token or backend connection is included.

## 中文说明

本作品的球体渲染器改编自 beUI Voice Orb，保留 © 2026 Saurabh Chauhan 的 MIT 许可、精确上游版本及 Edumanus 修改说明。它不是旧 `voice` 原型的 ElevenLabs 材质，不应混用两者署名。

第三方库和本地 Geist 字体的完整许可随源码与静态演示一起保留；Lucide 同时包含 ISC 与 Feather 的 MIT 版权说明。Edumanus 应用源码没有在本次归档中获得新的统一授权。演示不附带真实录音、用户聊天、麦克风采集、房间令牌或业务连接。

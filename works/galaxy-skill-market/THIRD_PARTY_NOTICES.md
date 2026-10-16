# Galaxy Skill Market — third-party notices

These notices cover the third-party software and font used by the archived demo. They do not grant a new license to the Edumanus application source or to the prototype's reference recording. Complete upstream license texts are retained in the accompanying `licenses/` directory, linked individually below.

## Direct runtime dependencies

Versions match `src/package.json`. Unless noted otherwise, license text was copied unchanged from the corresponding published package. The Fiber package does not include a license file, so its full notice was obtained from the matching upstream release tag.

| Package | Version | License and attribution | Complete text |
| --- | --- | --- | --- |
| [React](https://github.com/facebook/react) | 19.2.1 | MIT; Meta Platforms, Inc. and affiliates | [react-19.2.1.txt](licenses/react-19.2.1.txt) |
| [React DOM](https://github.com/facebook/react) | 19.2.1 | MIT; Meta Platforms, Inc. and affiliates | [react-dom-19.2.1.txt](licenses/react-dom-19.2.1.txt) |
| [Three.js](https://github.com/mrdoob/three.js) | 0.182.0 | MIT; © 2010–2025 three.js authors | [three-0.182.0.txt](licenses/three-0.182.0.txt) |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | 9.7.0 | MIT; © 2019–2025 Poimandres | [react-three-fiber-9.7.0.txt](licenses/react-three-fiber-9.7.0.txt); [official tagged source](https://github.com/pmndrs/react-three-fiber/blob/v9.7.0/LICENSE) |
| [Drei](https://github.com/pmndrs/drei) | 10.7.8 | MIT; © 2020 react-spring | [react-three-drei-10.7.8.txt](licenses/react-three-drei-10.7.8.txt) |
| [Motion](https://github.com/motiondivision/motion) | 12.38.0 | MIT; © 2024 Motion B.V. | [motion-12.38.0.txt](licenses/motion-12.38.0.txt) |
| [Lucide React](https://github.com/lucide-icons/lucide) | 0.522.0 | ISC; Lucide Contributors 2022; includes portions of Feather © Cole Bemis 2013–2022 under MIT | [lucide-react-0.522.0.txt](licenses/lucide-react-0.522.0.txt) |
| [use-intl](https://github.com/amannn/next-intl) | 4.13.2 | MIT; © 2024 Jan Amann | [use-intl-4.13.2.txt](licenses/use-intl-4.13.2.txt) |
| [Geist, distributed by Fontsource](https://github.com/vercel/geist-font) | @fontsource-variable/geist 5.3.0 | SIL Open Font License 1.1; © 2024 The Geist Project Authors | [fontsource-variable-geist-5.3.0.txt](licenses/fontsource-variable-geist-5.3.0.txt) |

Geist is bundled locally as an unmodified font. Lucide's complete notice is retained rather than relabeling its icons as MIT-only. The Galaxy shader and geometry do not load a third-party environment map, model, texture or remote avatar.

## Transitive dependencies and build output

The build records packages contributing rendered modules in `demo/bundled-packages.json`. Alongside the direct dependencies above, the current static bundle includes the following transitive dependencies. Versions come from that report and the npm lockfile; full texts are copied unchanged from the installed packages.

| Package | Version | License and attribution | Complete text |
| --- | --- | --- | --- |
| @formatjs/fast-memoize | 3.1.7 | MIT; © 2023 FormatJS | [formatjs-fast-memoize-3.1.7.txt](licenses/formatjs-fast-memoize-3.1.7.txt) |
| @formatjs/icu-messageformat-parser | 3.5.18 | MIT; © 2023 FormatJS | [formatjs-icu-messageformat-parser-3.5.18.txt](licenses/formatjs-icu-messageformat-parser-3.5.18.txt) |
| @formatjs/icu-skeleton-parser | 2.1.11 | MIT; © 2023 FormatJS | [formatjs-icu-skeleton-parser-2.1.11.txt](licenses/formatjs-icu-skeleton-parser-2.1.11.txt) |
| framer-motion | 12.43.0 | MIT; © 2018 Framer B.V. | [framer-motion-12.43.0.txt](licenses/framer-motion-12.43.0.txt) |
| intl-messageformat | 11.2.15 | BSD-3-Clause; © 2023 Oath Inc. | [intl-messageformat-11.2.15.txt](licenses/intl-messageformat-11.2.15.txt) |
| its-fine | 2.1.1 | MIT; © 2022–2025 Poimandres | [its-fine-2.1.1.txt](licenses/its-fine-2.1.1.txt) |
| motion-dom | 12.43.0 | MIT; © 2024 Motion B.V. | [motion-dom-12.43.0.txt](licenses/motion-dom-12.43.0.txt) |
| react-use-measure | 2.1.7 | MIT; © 2019–2025 Poimandres | [react-use-measure-2.1.7.txt](licenses/react-use-measure-2.1.7.txt) |
| scheduler | 0.27.0 | MIT; Meta Platforms, Inc. and affiliates | [scheduler-0.27.0.txt](licenses/scheduler-0.27.0.txt) |
| suspend-react | 0.1.3 | MIT; © 2021 Paul Henschel | [suspend-react-0.1.3.txt](licenses/suspend-react-0.1.3.txt) |
| use-sync-external-store | 1.7.0 | MIT; Meta Platforms, Inc. and affiliates | [use-sync-external-store-1.7.0.txt](licenses/use-sync-external-store-1.7.0.txt) |
| zustand | 5.0.15 | MIT; © 2019 Paul Henschel | [zustand-5.0.15.txt](licenses/zustand-5.0.15.txt) |

The Vite build copies this notice and the complete `licenses/` directory into `demo/`; the portfolio builder carries both into the deployed standalone demo. Preserve them when redistributing that output. The declared Motion package is retained in the direct-dependency notices even though its runtime code is represented in the bundle report by `framer-motion` and `motion-dom`. Build tooling is specified in the source manifest and lockfile, but its executable code is not shipped in the browser demo.

## Application and reference material

The application was adapted from JJchess's Edumanus Galaxy implementation and its earlier `voice` prototype; exact source revisions and contribution boundaries are recorded in the [work README](https://github.com/JJchess/Eregion/blob/main/works/galaxy-skill-market/README.md). The reviewed projects had no root license covering their application code, and this archive does not assign one.

The prototype references a user-provided recording, `屏幕录制 2026-10-11 092743.mp4`, whose public creator and reuse license were not recorded. Neither that video nor reference-comparison images are distributed. The earlier prototype's ElevenLabs-derived voice material is a separate component and is not included in Galaxy.

## 中文说明

以上完整许可声明适用于本演示实际使用的第三方库和字体，不替 Edumanus 应用源码或参考录像授予新许可。许可证正文保留在 `licenses/`，静态演示分发时也应随包保留。

Geist 字体以未修改版本本地托管，按 SIL OFL 1.1 使用；Lucide 同时包含 ISC 及 Feather 的 MIT 版权说明。Fiber 的安装包未附许可文件，因此从对应 `v9.7.0` 官方标签补齐。Galaxy 的珠光材质和几何体由程序生成，没有附带外部环境贴图、模型、纹理或远程头像。

应用来源版本与整理贡献详见 README。用户提供的视觉参考录像及对照图不在本归档中，原型里另一套来自 ElevenLabs 的语音材质也未包含在内。

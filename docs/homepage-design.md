# Personal site design record

## Approved direction

This record describes the original JJchess personal site. The Lusion comparison site in `replicas/lusion/` remains a separate local research artifact and is not part of the public build.

| Decision | Implementation contract / acceptance |
| --- | --- |
| Light surfaces and oversized typography, informed by Lusion | One visual system across Home, About, Projects and work details |
| An original, playable UI installation | Four native UI components can be separated, used and assembled; Three.js supplies optional decoration |
| A personal identity grounded in actual work | JJchess copy and truthful process; no invented clients, awards, cases or achievements |
| Show only approved works | Galaxy Skill Market is the first approved entry; empty archive/filter states remain supported, with no fake project cards |
| English by default, with Chinese available | Independent static URLs; language switching preserves the equivalent page and work slug |
| Preserve the collection workflow | Existing required `work.json` fields and approval rules; optional translation metadata |
| Match local preview to deployment | `scripts/serve.py --port 4179` serves `_site` at `/portfolio/` |
| Keep native scrolling | `overscroll-behavior: none` on the root and scroll containers; keyboard and touch scrolling remain available |

The earlier dark metal JJ hero and dialog-only project details are superseded by this direction. Their previous test results do not establish that the new site passes validation.

## Routes and content

| Page | English | 中文 |
| --- | --- | --- |
| Home | `/portfolio/` | `/portfolio/zh/` |
| About | `/portfolio/about/` | `/portfolio/zh/about/` |
| Projects | `/portfolio/projects/` | `/portfolio/zh/projects/` |
| Approved work | `/portfolio/projects/<slug>/` | `/portfolio/zh/projects/<slug>/` |

These are the default local preview paths. The formal deployment is [Eregion](https://jjchess.github.io/Eregion/), with the same suffixes under `/Eregion/`; its source repository is [JJchess/Eregion](https://github.com/JJchess/Eregion). CI supplies the deployment base path to the builder. Local preview remains at port 4179 and `/portfolio/` unless both build and server receive `--base-path /Eregion/`.

Each URL has its own HTML response and can be opened directly. Navigation and archive content must remain usable without JavaScript. A work detail is generated only when a valid approved entry exists in `works/`; the four homepage components are not automatically registered as portfolio entries.

`work.json` remains the single source of work copy. `locale` describes the primary fields and defaults to `zh` for existing entries. `translations.en` and `translations.zh` override `title`, `summary`, `tags` and `highlights` field by field; absent translations fall back to primary content. New entries use English primary fields with `locale: "en"` and a complete Chinese translation. Both languages share the same slug, date, category, source, preview and demo. See [the archive contract](../works/README.md).

## Interaction and progressive enhancement

Native buttons, inputs and other semantic controls carry the actual interaction. The WebGL layer is decorative: a Three.js import failure or unavailable WebGL leaves the component controls and content usable. Keyboard users can operate the installation with visible focus, and reduced-motion preferences suppress ambient and transition motion without hiding content.

The installation should fit mobile screens without horizontal overflow and preserve vertical touch scrolling. Decorative rendering should limit DPR and stop unnecessary work offscreen or when the document is hidden.

| Component | 中文 | Intended behavior |
| --- | --- | --- |
| Action button | 操作按钮 | Update a visible action count |
| Theme switch | 主题开关 | Switch the installation's light/dark presentation |
| Radius control | 圆角控制 | Adjust component corner radius with a native range input |
| Live state | 实时状态 | Reflect the current count, theme and radius |

Assembly, rotation and reset controls operate on this shared installation. Control values and manually selected assembly states are shared across language changes and remounts.

## References and assets

Lusion informs the light palette, type scale and visual pacing. Bruno Simon informs the idea that interaction can demonstrate ability; Rauno informs type hierarchy and small control details. These are design references. The public site uses original UI and geometry, not the Lusion study's assets or its research cache.

Locally hosted dependencies retained from the site:

- **Three.js 0.186.1**, MIT. `site/vendor/three/three.module.js` and `three.core.js`; license at `site/vendor/three/LICENSE`. The recorded release is [three-0.186.1.tgz](https://registry.npmjs.org/three/-/three-0.186.1.tgz).
- **Manrope**, SIL Open Font License 1.1. Latin variable WOFF2 at `site/assets/manrope-latin.woff2`; license at `site/assets/Manrope-OFL.txt`. Chinese text uses system fonts.

The build copies an explicit frontend asset list and approved previews/demos into `_site`. It excludes `replicas/`, drafts, source workspaces and external research caches. Source and README links point to the corresponding GitHub work directory. Test fixtures belong in temporary directories, never in the approved archive.

## Logo system

The JJchess signature combines a custom geometric double-J with outlined Manrope lettering. The second square dot uses electric blue. Its letter outlines come from the bundled Manrope at weight 800; the logo renders without waiting for fonts, and the included SIL OFL notice is retained.

`site/assets/brand.svg` is the shared vector source: `#wordmark` serves the header and footer, and `#mark` serves the white-on-black page transition. `site/assets/mark.svg` is a standalone favicon with matching geometry and light ink for dark browser tabs. Both home links have complete, localized accessible names and a minimum 44 px target height. The footer signature and caption stack on narrow screens.

Official Chrome verified both languages at 1440, 390 and 320 px: no horizontal overflow or navigation overlap, correct home links, transition cleanup, and visible 16/32/64 px favicons on light and dark backgrounds. All 27 Python tests also passed after adding the shared SVG to the build allowlist.

## Personal-site baseline validation, 2026-10-16

Before the first work was collected, the personal-site build passed local validation with official Google Chrome 155.0.8059.84, attached through CDP 9224. The counts below describe that baseline, not the later Galaxy collection:

- All 27 Python tests passed. The production build contains zero approved works, eight HTML documents and approximately 2.3 MB of static output. All 142 scanned local links resolve.
- Visual review at 1440 × 1000 covered English and Chinese Home, the Chinese story section, and English About/Projects. At 390 × 844, Chinese Home and English About were visually reviewed.
- Thirteen hero input checks passed, covering five mouse activations, an assembled-state click, three native CDP touch activations, theme/radius controls, reset and rotation. The exercised controls did not cause unwanted scroll jumps or horizontal overflow. CDP touch input is browser-level testing, not a physical-phone result.
- The repository, Codex and Claude Code collection skills passed their frontmatter/structure validation. Only the bilingual collection block was added to the installed copies; their existing local instructions and eight checked configuration files remained unchanged.
- The full browser suite passed pointer input, count/theme/radius retention across language switches and remounts, menu Escape focus restoration, and Back during a delayed fetch and unfinished transition. The interrupted route left no stale transition layer, `inert` or busy state.
- An isolated fixture exercised category filters including empty results, filter retention across languages, translated detail pages, previews, source links, a working local demo and next-project routes. Unknown English and Chinese URLs returned HTTP 404. The real archive remained empty.
- Eight HTML routes and native language navigation worked without JavaScript. Blocked Three.js imports and WebGL context creation failure both retained the native DOM action. Reduced-motion controls, still poses and transition cleanup passed. No uncaught browser exceptions occurred in the exercised flows.
- At 390 px, Home, the fixture archive and fixture details had no horizontal overflow. After the 320 px corrections and `document.fonts.ready`, all six English/Chinese Home, About and Projects pages had `scrollWidth = clientWidth = 305` in the 320 px viewport.
- Root top/bottom wheel boundaries passed. At 320 × 360, repeatedly wheeling a menu already at its lower limit kept the outer page at scroll position zero; the menu retained `overscroll-behavior: none`.

Browser evidence is kept outside the published tree in `personal-20261016/browser/report.json`, `browser/width-320.json` and `final-checks.json` under the local research directory. Browser fixtures and their temporary static handlers were cleaned up without adding works.

Local entry points are `http://localhost:4179/portfolio/` and `/portfolio/zh/`.

WebGL context loss was not tested; the verified GPU fallback covers context creation failure. Physical trackpad/phone elastic scrolling and hardware frame rates also remain unmeasured. That redesign validation did not itself collect a work.

## First approved work: Galaxy Skill Market

The user explicitly approved collecting Galaxy Skill Market from the Edumanus frontend. The entry lives in [`works/galaxy-skill-market/`](../works/galaxy-skill-market/README.md), with one source tree, a real preview and a standalone static demo shared by both languages. Its primary metadata is English (`locale: "en"`) with complete Chinese translations. Generated detail paths are `/portfolio/projects/galaxy-skill-market/` and `/portfolio/zh/projects/galaxy-skill-market/` locally, and their `/Eregion/` equivalents in production.

The extraction keeps the programmatic pearl map and its interaction model while replacing authenticated catalog, organization and installation services with synthetic demo data and local state. It does not distribute business credentials, user records, private skill prompts, reference footage or unrelated project assets. Provenance and the actual third-party dependency notices belong to the work's own README and license directory; no new blanket license is assigned to its application source.

The repository's current 28 Python tests passed. A fresh official Chrome 155 pass through CDP also passed the personal site's bilingual 1280 px desktop and 390/320 px layouts, native controls, language routing, Back race, isolated work fixtures, real 404 responses, reduced motion, unavailable Three.js/WebGL creation fallback, and eight no-JavaScript routes, with no uncaught exceptions. These checks cover the surrounding site, not the new demo.

The Galaxy clean `npm ci`, type check and static build passed under Node.js 20.20.2/npm 10.8.2, along with four focused model tests covering layout reachability/spacing, spring timing/reduced motion, installation/material states and Agent validation/storage fallback. The build's rendered-module inventory contains 20 runtime packages; 21 complete license files cover those packages plus the declared Motion entry package. The source and standalone demo notices and license files match byte for byte.

The real archive now builds with one approved work, and all 28 repository Python tests passed again after collection. Its 1440 × 960 `preview.webp` is a direct official Chrome CDP screenshot, with no generated background or reference-image composition. Desktop overview, category/detail and dark-theme views, plus 390 px Chinese list/detail views, were visually reviewed without uncaught runtime exceptions.

The complete Galaxy regression passed in official Chrome 155.0.8059.84:

- Camera pan, wheel zoom and recenter; actual pointer selection of a category and skill, simulated installation/removal, and keyboard return.
- Agent cancel/save and nickname/palette persistence after reload; empty/matching searches, English/Chinese and theme switches; rapid category changes without duplicate or lingering spheres.
- Reduced motion and Escape. At 390/320 px, emulated touch traversed list, detail, installation and back without horizontal overflow; the mobile entry did not download the 3D scene.
- WebGL context creation failure retained a usable fallback. Root and nested scroll containers retained `overscroll-behavior: none`.
- No business API or remote-resource requests, failed HTTP responses or uncaught exceptions occurred in the exercised flows.

These are local browser results. Physical phone/trackpad elastic scrolling and hardware frame rates remain unmeasured; context loss after successful WebGL creation was not tested. Publication runs through the repository's GitHub Actions Pages workflow; the formal site and demo use `/Eregion/` while default local preview remains `/portfolio/`.

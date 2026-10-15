# Homepage design record

## User decisions

| Decision | Implementation / acceptance |
| --- | --- |
| Show technical ability and taste; reference all four sites | One identity system rather than four disconnected sections |
| Playable hero, rather than a driving world | Drag the JJ object; click or use buttons to explode, assemble, reset |
| Dark, silver, electric blue | #080b11 background, #eef0f4 typography, #527cff accent; shared throughout the page |
| Original metal JJ identity | Procedural segmented geometry, studio reflections and blue seams; no borrowed models |
| Keep archiving and deployment | Existing work.json contract, Python stdlib build and Pages workflow |
| No elastic scroll boundaries | overscroll-behavior: none on every element; preserve vertical touch scrolling |

## Reference-to-target matrix

These are design references, not copied source implementations. All page code, geometry and SVG artwork were authored for this repository.

| Reference | Adapted idea | Deliberate difference | Verification |
| --- | --- | --- | --- |
| [Lusion](https://lusion.co/) | Realtime object as the visual focal point, directional studio lighting | Original JJ geometry and procedural environment; no proprietary media | Inspect highlights, framing and composition on desktop/mobile |
| [Bruno Simon](https://bruno-simon.com/), [MIT source](https://github.com/brunosimon/folio-2025/tree/41046b57eeed8d156d9c3fd7fa259900baef7816) | Direct manipulation with visible feedback | Hero-scale interaction, no driving/physics/world assets | Drag, click, reset and keyboard controls |
| [Wide](https://tympanus.net/codrops/2026/09/28/wide-template/) | Typographic anchors and changing project compositions | Two original gallery/index layouts generated from the archive | Filter, switch layouts, preserve item continuity |
| [Rauno](https://rauno.me/) | Strong type hierarchy and carefully resolved small interactions | JJchess copy, palette, layout and mark | Review sizes, spacing, hover, focus and mobile layout |

## Third-party dependencies

- **Three.js 0.186.1**, MIT. Unmodified `three.module.js` and `three.core.js` from the [npm release](https://registry.npmjs.org/three/-/three-0.186.1.tgz), hosted locally. The tarball was verified against npm SHA-512 integrity: `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==`. License: `site/vendor/three/LICENSE`.
- **Manrope**, SIL Open Font License 1.1. Latin variable WOFF2 from [Google Fonts](https://fonts.google.com/specimen/Manrope), [font file](https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSg.woff2). License: `site/assets/Manrope-OFL.txt`. Chinese copy uses system fonts. No runtime font requests to third parties.

## Runtime and publishing

The first HTML response contains all navigation, copy, archive links, cards and accessible dialogs. `filter.js` progressively enables filtering, layout transitions and dialogs. Without JavaScript, previews link straight to the demo or source. The optional hero module imports Three.js only near the viewport. A generated SVG poster is always present underneath the canvas; import/WebGL/context failures return to it.

The hero limits DPR, pauses when hidden/offscreen and caps the touch layout at 30 fps. Reduced motion disables ambient movement and interpolated interactions. Geometry and lighting use no remote assets. Mobile horizontal drags rotate; native vertical gestures scroll.

`scripts/build.py` copies an explicit frontend asset allowlist, then renders cards and details from each approved work. The generated site uses relative assets and works under `/portfolio/`. Empty galleries show an honest empty state; test fixtures are always built outside the repository.

Native trackpad and physical phone elastic scrolling still require hardware validation; browser automation does not establish that result.

## Validation, 2026-10-16

- Python: 17 tests passed; production build succeeded with zero invented works.
- Chromium via Playwright at 1440×1000 and touch emulation at 390×844: live rendering, drag, explode/reset, offscreen suspension, reduced-motion still frames, WebGL context-loss fallback.
- Archive fixtures: category filters including zero matches, gallery/index switching, Enter/Escape, dialog focus and scroll restoration, pointer backdrop dismissal, resize without horizontal overflow, `/portfolio/` assets and relative demo links.
- Resilience: blocked Three.js module retains the page; no-JavaScript previews retain source/demo links; no uncaught browser exceptions in the exercised flows.
- Browser tests use software WebGL. Hardware frame rates and native elastic scrolling have not been measured on a physical phone or trackpad.

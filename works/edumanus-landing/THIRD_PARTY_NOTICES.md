# Third-party notices

This is an extracted and adapted **Edumanus / AI Cosmos product landing page**, not a claim that all effects, photographs or dependencies were created from scratch. Code integration, product composition, bilingual copy, galaxy interaction and portfolio adaptation are distinct from the upstream works credited below.

## Adapted effects

| Included part | Upstream source | Applicable license and modifications |
| --- | --- | --- |
| Product image-to-content reveal and cover images | [Codrops ImageToContent](https://github.com/codrops/ImageToContent/tree/b4bbdc7b1809e56ee129ac296c5dcf1849a00c2d) | [MIT](licenses/codrops-image-to-content-MIT.txt). React product player, lifecycle cleanup, section scroller and bilingual content. Five covers are unchanged upstream `2.jpg`, `4.jpg`, `6.jpg`, `7.jpg`, `8.jpg`; upstream credits [Unsplash](https://unsplash.com). See [image license](licenses/unsplash-license.txt). Individual photographer names are not supplied upstream. |
| OrbitFlow dual-column sine-wave text | [Valentin Descombes / Codrops Dual Wave Text Animation](https://github.com/ValentinDBS/codrops-tutorial-text-animation/tree/90dfeb2eec89dd6879cabf2e76f4e7096e515a8a) | [MIT](licenses/codrops-dual-wave-MIT.txt). React port using the existing scroll container; omits ScrollSmoother and all upstream Midjourney images. |
| Isometric product illustration grid | [JJchess/IsometricGrids](https://github.com/JJchess/IsometricGrids/tree/ab6aba37616c29eda294d9909a50f4d9c7b25699), fork of Codrops | Source `js/main.js` explicitly declares MIT, Copyright 2016 Codrops. [Full MIT text](licenses/codrops-isometric-grids-MIT.txt) and [upstream README terms](licenses/isometric-source-terms.txt) are retained. The README permits personal/commercial integration and excludes redistribution as-is. This is a scoped React integration with Edumanus artwork, cleanup and responsive behavior. Original Dribbble/Unsplash grid artwork is not included. Only structural `canvas.png` and `wireframe.png` are retained. |

## Vendored isometric runtime

`src/public/landing/vendor/isometric-grids/` contains imagesLoaded 3.1.8, Masonry 3.3.2 and Dynamics.js from the IsometricGrids distribution. The bundled files retain their original headers.

- imagesLoaded / Masonry / Bridget / eventie / getStyleProperty / getSize / docReady / matchesSelector / Fizzy UI utils / Outlayer: David DeSandro and contributors, [MIT](licenses/desandro-MIT.txt). Upstream documentation: [imagesLoaded](https://github.com/desandro/imagesloaded), [Masonry](https://github.com/desandro/masonry), [license](https://desandro.mit-license.org/). getStyleProperty credits the original method by kangax.
- EventEmitter 4.2.6 in imagesLoaded: Oliver Caldwell, [MIT](licenses/eventemitter-v4.2.6-MIT.txt).
- EventEmitter 4.2.11 in Masonry: Oliver Caldwell, [Unlicense](licenses/eventemitter-v4.2.11-UNLICENSE.txt).
- Dynamics.js: Michael Villar, [MIT](licenses/dynamics-MIT.txt); includes vector/matrix portions of Sylvester by James Coglan, [MIT](licenses/sylvester-MIT.txt).

## Project media and scope

- The AI Cosmos mark, galaxy fallback renders, 35 educational illustrations and five existing product demonstration recordings come from the user's Edumanus source project. They are included for the authorized portfolio presentation, with no assertion of third-party ownership or universal relicensing.
- The illustrations retain their original dimensions and are encoded as WebP quality 88 (54.84 MB of PNG input reduced to 6.54 MB). No new image content is generated.
- Product recordings remain 1280 × 708 with their original durations and no audio. Known account/avatar areas and the cloud-classroom student roster are obscured in the export. Generic teaching dialogue and example names may remain. This is **not** a claim of exhaustive video anonymization or review of every frame.
- Five posters and 20 thumbnail images are real frames re-extracted from the treated videos, matched against the original stills at two samples per second. Original video captions remain embedded in Chinese; the surrounding landing page supports English and Chinese.
- Visual audit: all 35 illustrations, five covers, five original posters and 20 original thumbnails; eight spread-out frames per recording, plus a two-second contact sheet for the recordings with account names. Treated output was reviewed using eight frames per video and all 25 re-extracted stills. No original project environment files, authentication tokens, databases or business API payloads are included.
- No unused CosmosCore / reactive-hero assets or unrelated business assets are copied.

## Runtime and fonts

[Runtime notices](licenses/runtime/README.md) list the 15 JavaScript packages actually present in the rendered chunks. Their full distributed notices accompany the demo, including React, Three.js, Motion, FormatJS and Lucide. Split Type declares ISC in its upstream package metadata and contains credited Lodash splitting logic; both notices are retained. GSAP uses its [Standard No Charge License](https://gsap.com/community/standard-license/), not MIT; original GSAP copyright headers remain in the bundled code.

Geist, Geist Mono, Enriqueta and Noto Serif SC retain their complete [OFL notices](licenses/fonts/). Noto uses only the original, unmodified font fragments needed for this page's Chinese text. Fontsource supplies the font packaging. `demo/bundled-packages.json` records the actual 15 JavaScript and four font package versions; the source lockfile fixes the installation. Third-party materials retain their original terms.

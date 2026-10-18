import { defineConfig } from "vite";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = dirname(fileURLToPath(import.meta.url));
const gsapSource = readFileSync(resolve(project, "node_modules/gsap/gsap-core.js"), "utf8");
const gsapLicenseHeader = gsapSource.match(/\/\*![\s\S]*?\*\//)?.[0];
if (!gsapLicenseHeader?.includes("@license")) throw new Error("GSAP license header was not found");

export default defineConfig({
  base: "./",
  resolve: { alias: { "@": project } },
  build: {
    outDir: "../demo",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, handler) {
        // This application is entirely client-rendered; RSC boundaries have no role.
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") handler(warning);
      },
    },
  },
  plugins: [
    {
      name: "demo-license-files",
      generateBundle(_options, bundle) {
        const packages = new Map<
          string,
          { name: string; version: string; license: unknown }
        >();
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk") continue;
          // generateBundle runs after minification: keep GSAP's original notice intact.
          const bundledGsap = Object.keys(chunk.modules).some((id) => id.includes("/node_modules/gsap/"));
          chunk.code = `${bundledGsap ? gsapLicenseHeader + "\n" : ""}/*! Third-party notices: ../THIRD_PARTY_NOTICES.md; license texts: ../licenses/ */\n${chunk.code}`;
          for (const [id, module] of Object.entries(chunk.modules)) {
            if (!id.includes("/node_modules/") || module.renderedLength === 0)
              continue;
            let path = dirname(id.split("?")[0]);
            while (path.includes("/node_modules/")) {
              const manifest = resolve(path, "package.json");
              if (existsSync(manifest)) {
                const { name, version, license } = JSON.parse(
                  readFileSync(manifest, "utf8"),
                );
                if (name && version)
                  packages.set(`${name}@${version}`, {
                    name,
                    version,
                    license,
                  });
                break;
              }
              path = dirname(path);
            }
          }
        }
        // Font assets are emitted from CSS rather than JavaScript chunk modules.
        for (const font of ["@fontsource-variable/geist", "@fontsource-variable/geist-mono", "@fontsource-variable/noto-serif-sc", "@fontsource/enriqueta"]) {
          const { name, version, license } = JSON.parse(readFileSync(resolve(project, "node_modules", font, "package.json"), "utf8"));
          packages.set(`${name}@${version}`, { name, version, license });
        }
        this.emitFile({
          type: "asset",
          fileName: "bundled-packages.json",
          source: JSON.stringify(
            [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)),
            null,
            2,
          ),
        });
      },
      closeBundle() {
        cpSync(resolve(project, "font-licenses"), resolve(project, "../demo/licenses/fonts"), { recursive: true });
        const notices = resolve(project, "../THIRD_PARTY_NOTICES.md");
        const licenses = resolve(project, "../licenses");
        if (existsSync(notices))
          cpSync(notices, resolve(project, "../demo/THIRD_PARTY_NOTICES.md"));
        if (existsSync(licenses))
          cpSync(licenses, resolve(project, "../demo/licenses"), {
            recursive: true,
          });
      },
    },
  ],
});

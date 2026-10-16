import { defineConfig } from "vite";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    outDir: "../demo",
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
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

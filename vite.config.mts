/**
 * The renderer's build. Everything else still goes through tsc.
 *
 * This exists because React cannot be loaded the way i18next was -- by pointing
 * an import at a file inside node_modules -- since its distributed files call
 * for their dependencies by bare name, and hand-maintaining an import map is
 * worse than the bundler we were avoiding. `docs/DECISIONS.md` 2026-08-02 turned
 * a bundler down; this is the entry that answers it.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Let a `.js` specifier find the `.ts` file it was always naming.
 *
 * Every import in the renderer ends in `.js` because until now the browser read
 * those specifiers literally and there was no build step to rewrite them. The
 * files themselves have been TypeScript since #70. Rollup does not guess, so it
 * is told here -- and only when the `.ts` is actually on disk, so a genuine .js
 * (anything still coming out of node_modules) resolves normally.
 */
function jsSpecifiersAreTypeScript(): Plugin {
  return {
    name: "nekan:js-specifiers-are-typescript",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith(".") || !source.endsWith(".js")) {
        return null;
      }
      const stem = resolve(dirname(importer), source).replace(/\.js$/, "");
      const candidate = [`${stem}.ts`, `${stem}.tsx`].find((f) =>
        existsSync(f),
      );
      if (!candidate) return null;
      return this.resolve(candidate, importer, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  root: resolve(root, "src/renderer"),
  // Relative, because the packaged app opens this file off disk with
  // loadFile() -- there is no server and no origin for an absolute path to be
  // absolute against. Getting this wrong is silent until the app is packaged.
  base: "./",
  plugins: [jsSpecifiersAreTypeScript(), tailwindcss(), react()],
  build: {
    outDir: resolve(root, "out/renderer"),
    emptyOutDir: true,
    // Electron 43 ships Chromium 140. Nothing here has to run anywhere else,
    // so there is no reason to down-level and every reason not to.
    target: "chrome140",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Hashes buy nothing here -- the app opens these files off disk, so
        // there is no cache to bust -- but they cost something for the font:
        // the main process wants to hand the same file to printToPDF, and it
        // cannot name a file whose name changes every build. So the font keeps
        // its name and everything else is hashed, which at least makes a stale
        // asset obvious rather than silently shadowing a fresh one.
        assetFileNames: (info) =>
          info.names?.some((n) => n.endsWith(".woff2"))
            ? "assets/[name][extname]"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
  // The renderer sits under src/renderer but reaches up for shared/ and the
  // icon, both of which are outside the root.
  server: { fs: { allow: [root] } },
});

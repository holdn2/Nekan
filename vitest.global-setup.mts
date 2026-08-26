/**
 * Reads the CSS Tailwind actually compiled, once per test run, and hands it
 * to test files through vitest's provide/inject.
 *
 * Why not a plain import from a test file: that file lives under
 * `src/renderer`, and `tsconfig.renderer.json` gives that whole tree no Node
 * types and no `fs` (see CLAUDE.md -- this app's renderer and shared/ are
 * kept Node-and-DOM-clean on purpose, the same reason `shared/` cannot
 * `require("fs")`). This file sits at the repo root, outside that project
 * entirely, so it is the one place on the test side allowed to touch the
 * filesystem. `components/test/compiled-css.ts` reads the string back out
 * with `inject("builtCss")` -- see its own comment for what it proves and
 * why a className string alone cannot prove it.
 *
 * Requires `npm run build` to have already produced `out/renderer/assets/` --
 * `npm test` always runs the build first. Running `vitest run` on its own
 * against a stale or missing `out/` does not error here; it hands back an
 * empty string, and every compiled-class assertion downstream (correctly)
 * fails instead of silently passing on last build's output.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

const root = dirname(fileURLToPath(import.meta.url));

export function setup(project: TestProject) {
  const assets = join(root, "out", "renderer", "assets");
  const css = existsSync(assets)
    ? readdirSync(assets)
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFileSync(join(assets, f), "utf8"))
        .join("\n")
    : "";
  project.provide("builtCss", css);
}

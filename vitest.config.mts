/**
 * Two projects, one runner.
 *
 * A second runner, which wants justifying in a repo that has been proud of
 * `node --test` and no test dependencies. Two reasons. The renderer no longer
 * exists as files Node can require -- Vite bundles it into one chunk, so there
 * is nothing per-module to import -- and running the tests through Vite means
 * they see the same transform that ships rather than a second build made only
 * for them.
 *
 * The other runner keeps everything it had: shared/, main/ and store-io are
 * still `node --test` over out/test, and npm test runs both.
 *
 * The phone joined as a second project rather than a third invocation. Its
 * files are TypeScript that Node cannot require either -- they name
 * `@nekan/shared/*`, which resolves to source -- and the alternative was
 * another line in `npm test` that somebody would eventually run without.
 *
 * Tests sit next to what they test rather than under test/, because the entry
 * point is index.html and nothing reaches them from there -- the app bundle
 * cannot pick them up, and there is no glob to keep in step.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vite.config.mjs";

const root = dirname(fileURLToPath(import.meta.url));

const renderer = mergeConfig(
  base,
  defineConfig({
    test: {
      name: "renderer",
      // Relative to the Vite root, which the base config sets to src/renderer.
      include: ["**/*.test.tsx"],
      // The components read and write a document. happy-dom rather than jsdom
      // for the start-up cost: these are unit tests and there are going to be
      // a lot of them.
      environment: "happy-dom",
      // Relative to the Vite root, like `include` above.
      setupFiles: ["react/testing-setup.ts"],
      restoreMocks: true,
    },
  }),
);

/**
 * The phone's own modules, in Node.
 *
 * Nothing here draws, so there is no DOM to emulate: what these tests cover is
 * the sync client, which is HTTP and paging and a watermark. React Native is
 * never loaded -- the one module that reaches the device, `store/persist`, is
 * mocked by the tests that need it, and everything else the phone's sync
 * touches is plain TypeScript.
 *
 * `.test.ts`, not `.test.tsx`: the extension is what keeps the two projects
 * from picking up each other's files even though both are under this root.
 */
const mobile = defineConfig({
  test: {
    name: "mobile",
    root: resolve(root, "apps/mobile"),
    include: ["**/test/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    restoreMocks: true,
  },
});

export default defineConfig({
  test: {
    projects: [renderer, mobile],
    // Runs once, in Node, before any test file -- and, unlike a
    // setupFile, outside the Vite root and outside tsconfig.renderer.json's
    // node-less project. That is deliberate: it is the one place allowed
    // to touch `node:fs`, to hand the ui/ ports' component tests the CSS
    // Tailwind actually compiled (see components/test/compiled-css.ts).
    // Resolved against this file's own directory rather than the Vite
    // root, which mergeConfig points at src/renderer.
    globalSetup: [resolve(root, "vitest.global-setup.mts")],
  },
});

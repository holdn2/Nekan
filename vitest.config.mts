/**
 * Tests for the React half of the renderer.
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
 * Tests sit next to what they test rather than under test/, because the entry
 * point is index.html and nothing reaches them from there -- the app bundle
 * cannot pick them up, and there is no glob to keep in step.
 */

import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vite.config.mjs";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      // Relative to the Vite root, which the base config sets to src/renderer.
      include: ["**/*.test.tsx"],
      // The components read and write a document. happy-dom rather than jsdom
      // for the start-up cost: these are unit tests and there are going to be
      // a lot of them.
      environment: "happy-dom",
      restoreMocks: true,
    },
  }),
);

/**
 * The one value tests in this app need from outside the browser sandbox: the
 * CSS Tailwind actually compiled. `vitest.global-setup.mts` (at the repo
 * root, outside this project) reads it with `node:fs` and hands it in
 * through vitest's provide/inject; this just tells TypeScript the key
 * exists, so `components/test/compiled-css.ts`'s `inject("builtCss")` calls
 * type-check under `tsconfig.renderer.json` without that project needing
 * Node types of its own.
 */
declare module "vitest" {
  export interface ProvidedContext {
    builtCss: string;
  }
}

export {};

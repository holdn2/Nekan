/**
 * Metro for a workspace that is not the usual shape.
 *
 * The repository root is the Electron app, not an empty monorepo shell, so the
 * defaults do not apply: node_modules is hoisted to a root that also holds a
 * desktop build, and the one package this app imports -- @nekan/shared -- is a
 * symlink into src/shared, whose sources are TypeScript written for a bundler
 * that rewrites .js back to .ts.
 *
 * Two things follow, and both are here rather than in the shared package: the
 * package should not have to know which bundler is reading it.
 */
const path = require("node:path");
const fs = require("node:fs");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole repository: shared lives outside this app, and an edit there
// has to reach the bundle without a build step.
config.watchFolders = [workspaceRoot];

// Both node_modules, in that order. npm hoists to the root, but expo's own
// packages can land beside the app.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

/**
 * The shared sources import each other with a .js extension that names a file
 * which does not exist -- `./core/places.js` is `./core/places.ts` on disk.
 *
 * The renderer has the same rule and a Vite plugin joins the two ends; this is
 * that plugin for Metro. It fires only for relative requests coming out of
 * src/shared, so nothing else in the tree changes meaning, and it falls through
 * to the default whenever the .ts is not there -- a real .js import still
 * resolves as a real .js import.
 */
const SHARED = path.resolve(workspaceRoot, "src", "shared");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const from = context.originModulePath || "";
  if (
    moduleName.startsWith(".") &&
    moduleName.endsWith(".js") &&
    from.startsWith(SHARED)
  ) {
    const asTs = path.resolve(
      path.dirname(from),
      moduleName.slice(0, -3) + ".ts",
    );
    if (fs.existsSync(asTs)) {
      return { type: "sourceFile", filePath: asTs };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

/**
 * The iOS widget target.
 *
 * `targets/` is read by @bacons/apple-targets, which links this folder into the
 * generated Xcode project as a synchronized root group -- so every file beside
 * this one is part of the target, classified by its extension. That is why
 * Localizable.xcstrings needs no wiring: Xcode sees a string catalogue and
 * compiles it as a resource.
 *
 * deploymentTarget is 17.0 rather than the plugin's 18.0 default because 17 is
 * where `containerBackground(for: .widget)` arrives, and a widget without it
 * draws with no background at all on 17+. Going lower would mean an
 * availability branch around the background, and a branch that only runs on
 * hardware nobody here has is a branch nobody can check.
 *
 * An App Group, since 2026-09-24 (issue 144). Until then this target had none,
 * on the grounds that two doors into the app hold no data. The board widget
 * beside them shows tasks, and the only way a widget can read what the app
 * knows is a container both of them are entitled to. The same group is on the
 * app in app.json; widget/publish.ts writes to it and BoardWidget.swift reads.
 * Spelled out here although the plugin would copy the app's groups across on
 * its own -- a capability that decides whether the widget can see anything
 * should not depend on a default nobody wrote down.
 *
 * ESM and TypeScript are not supported in this file by the plugin.
 *
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: "widget",
  name: "quick",
  displayName: "Nekan",
  // Spelled out rather than left to the plugin, which derives it from the
  // target *type* and would call this one `.widget`. That is fine until there
  // are two widgets, at which point both want the same identifier and the
  // collision shows up as a signing failure rather than as a name clash.
  bundleIdentifier: ".quick",
  // AppIntents for the board widget's buttons: switching board, quadrant and
  // page happens in the widget's own process, without opening the app.
  frameworks: ["SwiftUI", "WidgetKit", "AppIntents"],
  entitlements: {
    "com.apple.security.application-groups": ["group.com.yoshi.nekan"],
  },
  // The Nekan mark on the board widget, which is also its visible door into
  // the app. The plugin writes it into this folder's Assets.xcassets at
  // prebuild (git ignores the result). A 96px copy of assets/icon.png rather
  // than the 1024px original: the widget draws it at about 20pt, and a widget
  // has a small memory budget to decode images into. Resolved against
  // apps/mobile, not this folder.
  images: {
    NekanMark: "./assets/widget-mark.png",
  },
  deploymentTarget: "17.0",
};

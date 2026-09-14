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
 * No App Group, and no entitlements object. This widget holds no data -- it is
 * two doors into the app -- so it has nothing to share with the app and asking
 * for a shared container would be asking for a capability to hold nothing.
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
  frameworks: ["SwiftUI", "WidgetKit"],
  deploymentTarget: "17.0",
};

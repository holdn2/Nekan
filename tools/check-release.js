/**
 * Make sure the draft electron-builder just made is one release with every
 * file a platform needs, and put it back together when it is not.
 *
 * electron-builder runs its publisher once per artifact and they race: both
 * look for a release to attach to, both find none, and both make one. The
 * uploads then land in different drafts. It has happened on every release so
 * far, each time splitting the .blockmap off on its own.
 *
 * Publishing the half without the blockmap costs every user a full download
 * instead of a differential one, and publishing the half without latest.yml
 * means nobody updates at all. Neither failure says anything at the time.
 *
 * Runs at the end of `npm run release`, so the repair is not a step anyone has
 * to remember. Needs GH_TOKEN, which that script already sets.
 */

const fs = require("fs");
const path = require("path");

const REPO = "holdn2/Nekan";

/**
 * What a complete release looks like, one entry per platform.
 *
 * Windows is `always` because `npm run release` builds it and this script runs
 * at the end of that -- if its files are not there, something failed silently.
 * Mac is not: that build comes off a macOS runner and lands in the same draft
 * at its own pace, so "no mac files yet" is an ordinary state on the way to a
 * release. "Half the mac files" is not, which is why the check turns on as
 * soon as the first one appears rather than being off until someone
 * remembers to turn it on.
 *
 * `owns` is what lets the count check go away. The old version asserted a
 * total of three assets, which said "nothing unexpected" only for as long as
 * there was one platform. Naming who owns each file says the same thing
 * without breaking the day a second one arrives.
 */
const PLATFORMS = [
  {
    name: "windows",
    always: true,
    owns: (n) => n === "latest.yml" || /\.exe(\.blockmap)?$/.test(n),
    required: [
      ["installer (.exe)", (n) => n.endsWith(".exe")],
      // Specifically the installer's. A mac blockmap used to satisfy this,
      // back when the test was any name ending in .blockmap.
      ["installer blockmap", (n) => n.endsWith(".exe.blockmap")],
      ["latest.yml", (n) => n === "latest.yml"],
    ],
  },
  {
    name: "mac",
    always: false,
    owns: (n) => n === "latest-mac.yml" || /\.(dmg|zip)(\.blockmap)?$/.test(n),
    required: [
      // The zip is the one electron-updater reads. A release with only the
      // .dmg installs fine by hand and then never updates again.
      ["zip", (n) => n.endsWith(".zip")],
      ["dmg", (n) => n.endsWith(".dmg")],
      ["latest-mac.yml", (n) => n === "latest-mac.yml"],
    ],
  },
];

/**
 * Judge a list of asset names. Pure, so the rules above can be tested without
 * a GitHub draft to point at.
 *
 * Returns the platforms it saw, what each is missing, and any file no platform
 * claims -- an unclaimed file means either a target nobody wrote a rule for or
 * something that does not belong in the release, and both are worth stopping
 * for.
 */
function auditAssets(names) {
  const present = PLATFORMS.filter(
    (p) => p.always || names.some((n) => p.owns(n)),
  );
  const missing = [];
  for (const platform of present) {
    for (const [label, test] of platform.required) {
      if (!names.some(test)) missing.push(`${platform.name}: ${label}`);
    }
  }
  const unexpected = names.filter((n) => !PLATFORMS.some((p) => p.owns(n)));
  return { platforms: present.map((p) => p.name), missing, unexpected };
}

module.exports = { auditAssets };

// Everything below talks to GitHub. Guarded so that requiring this file for
// the function above does not start a release check -- and, without a token,
// exit the process that did the requiring.
if (require.main === module) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("check-release: set GH_TOKEN (gh auth token)");
    process.exit(2);
  }

  const version = require("../package.json").version;
  const tag = `v${version}`;

  const api = async (url, init = {}) => {
    const res = await fetch(
      url.startsWith("http") ? url : `https://api.github.com${url}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          ...(init.headers || {}),
        },
      },
    );
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      throw new Error(
        `${init.method || "GET"} ${url} -> ${res.status} ${text}`,
      );
    }
    return body;
  };

  /** Re-upload a file this run built, since assets cannot be moved between releases. */
  const attach = async (releaseId, name) => {
    const file = path.join("dist", name);
    if (!fs.existsSync(file)) {
      throw new Error(
        `${name} is missing from dist/ -- rebuild before repairing`,
      );
    }
    await api(
      `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: fs.readFileSync(file),
      },
    );
    console.log(`  attached ${name}`);
  };

  (async () => {
    const releases = await api(`/repos/${REPO}/releases`);
    const drafts = releases.filter((r) => r.draft && r.tag_name === tag);

    if (drafts.length === 0) {
      console.error(`check-release: no draft for ${tag}`);
      process.exit(1);
    }

    // The one holding latest.yml is the feed, so it is the one to keep -- that
    // file is what installed apps actually read.
    const keep =
      drafts.find((r) => r.assets.some((a) => a.name === "latest.yml")) ||
      drafts[0];
    const extras = drafts.filter((r) => r.id !== keep.id);

    for (const extra of extras) {
      console.log(
        `check-release: folding split draft ${extra.id} into ${keep.id}`,
      );
      for (const asset of extra.assets) {
        if (!keep.assets.some((a) => a.name === asset.name)) {
          await attach(keep.id, asset.name);
        }
      }
      await api(`/repos/${REPO}/releases/${extra.id}`, { method: "DELETE" });
      console.log(`  deleted ${extra.id}`);
    }

    const final = await api(`/repos/${REPO}/releases/${keep.id}`);
    const names = final.assets.map((a) => a.name).sort();
    console.log(`\n${tag} draft ${final.id}`);
    names.forEach((n) => console.log(`  ${n}`));

    const { platforms, missing, unexpected } = auditAssets(names);
    console.log(`\nchecked: ${platforms.join(", ")}`);

    if (missing.length || unexpected.length) {
      if (missing.length)
        console.error(`\ncheck-release: missing ${missing.join(", ")}`);
      if (unexpected.length) {
        console.error(`check-release: unrecognised ${unexpected.join(", ")}`);
      }
      process.exit(1);
    }

    console.log("\nok — publish it on GitHub to make it live");
  })().catch((err) => {
    console.error("check-release:", err.message);
    process.exit(1);
  });
}

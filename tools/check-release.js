/**
 * Make sure the draft electron-builder just made is one release with all three
 * files, and put it back together when it is not.
 *
 * electron-builder runs its publisher once per artifact and they race: both
 * look for a release to attach to, both find none, and both make one. The
 * uploads then land in different drafts. It has happened on every release so
 * far -- v1.0.0 and v1.0.1, both times splitting the .blockmap off on its own.
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
const EXPECTED = 3; // installer, blockmap, latest.yml

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
    throw new Error(`${init.method || "GET"} ${url} -> ${res.status} ${text}`);
  }
  return body;
};

/** Re-upload a file this run built, since assets cannot be moved between releases. */
async function attach(releaseId, name) {
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
}

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

  const missing = [];
  if (!names.includes("latest.yml")) missing.push("latest.yml");
  if (!names.some((n) => n.endsWith(".exe"))) missing.push("installer");
  if (!names.some((n) => n.endsWith(".blockmap"))) missing.push("blockmap");

  if (missing.length || names.length !== EXPECTED) {
    console.error(
      `\ncheck-release: missing ${missing.join(", ") || "nothing"} (${names.length} assets)`,
    );
    process.exit(1);
  }

  console.log("\nok — publish it on GitHub to make it live");
})().catch((err) => {
  console.error("check-release:", err.message);
  process.exit(1);
});

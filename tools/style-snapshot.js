/**
 * Read every element's computed style out of the running app, so a stylesheet
 * can be rewritten and the result compared rather than eyeballed.
 *
 * #75 moves sixteen stylesheets to utilities one component at a time. The whole
 * risk of that is a declaration quietly not surviving the trip, and neither
 * test runner can see it: vitest renders into happy-dom, which has no cascade
 * worth the name, and `node --test` never touches the renderer at all. What
 * catches it is the real engine, and this is how to ask it.
 *
 *   node tools/style-snapshot.js capture <port> before.json
 *   ...change a stylesheet, npm run build, reload the window...
 *   node tools/style-snapshot.js capture <port> after.json
 *   node tools/style-snapshot.js diff before.json after.json
 *
 * Start the app the way CLAUDE.md's verification section says -- a throwaway
 * profile and a debugging port -- so this never touches real data:
 *
 *   npx electron . --user-data-dir=<tmp> --remote-debugging-port=9333
 *
 * Two things make the numbers trustworthy, and both were learned by getting
 * them wrong first:
 *
 *   - The viewport is pinned with Emulation.setDeviceMetricsOverride. The
 *     window is not a stable ruler: getBounds/setBounds is not idempotent on a
 *     scaled display, so folding and unfolding moves the window a pixel or two
 *     and every rect in the snapshot moves with it. The first run of this
 *     reported 918 differences for a change that was a pure refactor.
 *   - Elements are keyed by their position in the tree, not by class or id,
 *     because the class list is the thing being changed.
 *
 * It captures six states, because most of this app is not on screen at once and
 * a rule that only applies inside the trash tab is exactly the kind that gets
 * lost. Bar mode is captured at the real bar size so its layout is the real
 * one.
 */

const fs = require("fs");

const PROPS = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopColor",
  "borderBottomColor",
  "borderTopStyle",
  "borderRadius",
  "backgroundColor",
  "color",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "fontFamily",
  "gap",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignItems",
  "justifyContent",
  "flexDirection",
  "gridTemplateColumns",
  "gridTemplateRows",
  "opacity",
  "boxShadow",
  "overflowX",
  "overflowY",
  "textAlign",
  "textOverflow",
  "whiteSpace",
  "transform",
  "zIndex",
  "cursor",
  "visibility",
  "minHeight",
  "minWidth",
  "maxWidth",
  "maxHeight",
  // Added when archive.css moved: every one of these is a place a utility
  // can differ from the declaration it replaced without moving a pixel in
  // the states this captures -- and then differ visibly in one it does not.
  "wordBreak",
  "overflowWrap",
  "textDecorationLine",
  "listStyleType",
  "userSelect",
  "fontVariantNumeric",
  "webkitLineClamp",
  "pointerEvents",
  "transitionProperty",
  // Tailwind v4 rotates, scales and translates with the independent CSS
  // properties rather than through `transform`, so a rotated chevron reads
  // as `transform: none` and looks like a rotation that stopped working.
  "rotate",
  "scale",
  "translate",
];

/** Runs inside the page. Returns JSON, because CDP hands back a value. */
const SNAPSHOT = `(() => {
  const PROPS = ${JSON.stringify(PROPS)};
  const keyOf = (el) => {
    const parts = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const p = n.parentElement;
      if (!p) break;
      parts.push(n.tagName.toLowerCase() + ":" + [...p.children].indexOf(n));
      n = p;
    }
    return parts.reverse().join(">");
  };
  const out = {};
  for (const el of document.querySelectorAll("*")) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const rec = { _rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    for (const p of PROPS) rec[p] = cs[p];
    out[keyOf(el)] = rec;
  }
  return JSON.stringify(out);
})()`;

const VIEW = { width: 1000, height: 700 };
const BAR = { width: 684, height: 48 };

const STATES = [
  // Every run starts from the same place. Without the resets, a note left open
  // by the previous run is captured as if it were the resting state, and two
  // captures of the same build then differ by fifteen elements.
  [
    "matrix",
    'document.querySelector("#memoClose")?.click();' +
      'document.querySelector("#settingsPanel")?.classList.contains("hidden") === false &&' +
      'document.querySelector("#settingsBtn").click();' +
      'window.api.expand().then(()=>{document.querySelector("[data-tab=matrix]")?.click();return 1})',
  ],
  ["history", 'document.querySelector("[data-tab=history]").click(); 1'],
  ["trash", 'document.querySelector("[data-tab=trash]").click(); 1'],
  ["guide", 'document.querySelector("[data-tab=guide]").click(); 1'],
  // Opening the note takes a click on a quadrant row's text, not any row: the
  // brain dump's rows have no note by design, so clicking one selects nothing
  // and this state would capture a closed panel while looking like it worked.
  [
    "memo",
    'document.querySelector("[data-tab=matrix]").click(); document.querySelector(".quad .item .text")?.click(); 1',
  ],
  [
    "settings",
    'document.querySelector("#memoClose")?.click(); document.querySelector("#settingsBtn").click(); 1',
  ],
  [
    "bar",
    'document.querySelector("#settingsBtn").click(); window.api.collapse().then(()=>1)',
  ],
];

async function pageSocket(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error(`no page on port ${port} -- is the app up?`);
  return page.webSocketDebuggerUrl;
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const ready = new Promise((res) => ws.addEventListener("open", res));
  const send = (method, params) =>
    new Promise((res, rej) => {
      const myId = ++id;
      const timer = setTimeout(
        () => rej(new Error(`timeout: ${method}`)),
        20000,
      );
      const onMsg = (e) => {
        const m = JSON.parse(e.data);
        if (m.id !== myId) return;
        clearTimeout(timer);
        ws.removeEventListener("message", onMsg);
        res(m.result);
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  return { ready, send, close: () => ws.close() };
}

async function capture(port, out) {
  const { ready, send, close } = connect(await pageSocket(port));
  await ready;
  const evalIn = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails.exception));
    }
    return r.result.value;
  };

  await send("Page.bringToFront", {});
  const all = {};
  for (const [name, setup] of STATES) {
    await evalIn(setup);
    const v = name === "bar" ? BAR : VIEW;
    await send("Emulation.setDeviceMetricsOverride", {
      ...v,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 700));
    all[name] = JSON.parse(await evalIn(SNAPSHOT));
  }
  await send("Emulation.clearDeviceMetricsOverride", {});
  await evalIn("window.api.expand().then(()=>1)");
  close();

  fs.writeFileSync(out, JSON.stringify(all));
  const counts = Object.values(all).map((s) => Object.keys(s).length);
  console.log(
    `captured ${Object.keys(all).length} states (${counts.join("/")} elements) -> ${out}`,
  );
}

/**
 * Differences a utility makes that cannot reach a pixel.
 *
 * Two of these come up on every sheet that moves, and reporting them as
 * findings buries the ones that matter -- the matrix's move produced 161 and
 * every one was one of these:
 *
 *   A zero-width border's colour and style. `border-0` sets the width to zero
 *   and leaves style solid and colour black, where `border: 0` left style none
 *   and colour inherited. Nothing draws either way.
 *
 *   Tailwind composes box-shadow out of ring, inset and drop layers, so a
 *   single shadow comes back with four fully transparent layers in front of
 *   the real one. Same paint, different string.
 *
 * Anything else is reported. This is the one place in the tool that is allowed
 * to decide a difference does not count, so it decides narrowly.
 */
function isInert(prop, before, after, all) {
  if (prop === "boxShadow") {
    const layers = (v) =>
      String(v)
        .split(/,\s*(?=rgba?\()/)
        .map((x) => x.trim());
    const visible = (v) =>
      layers(v).filter(
        (l) => !/^rgba\(0, 0, 0, 0\)\s+0px 0px 0px 0px$/.test(l),
      );
    return JSON.stringify(visible(before)) === JSON.stringify(visible(after));
  }
  const width = {
    borderTopColor: "borderTopWidth",
    borderRightColor: "borderRightWidth",
    borderBottomColor: "borderBottomWidth",
    borderLeftColor: "borderLeftWidth",
    borderTopStyle: "borderTopWidth",
  }[prop];
  if (!width) return false;
  return (
    parseFloat(all.before[width]) === 0 && parseFloat(all.after[width]) === 0
  );
}

function diff(beforeFile, afterFile, full) {
  const a = JSON.parse(fs.readFileSync(beforeFile, "utf8"));
  const b = JSON.parse(fs.readFileSync(afterFile, "utf8"));
  let diffs = 0,
    gone = 0,
    added = 0,
    inert = 0;
  const byProp = {};
  for (const state of Object.keys(a)) {
    const A = a[state];
    const B = b[state] || {};
    for (const key of Object.keys(A)) {
      if (!(key in B)) {
        gone++;
        if (full) console.log(`[${state}] GONE ${key}`);
        continue;
      }
      for (const p of Object.keys(A[key])) {
        const av = JSON.stringify(A[key][p]);
        const bv = JSON.stringify(B[key][p]);
        if (av === bv) continue;
        if (
          isInert(p, A[key][p], B[key][p], { before: A[key], after: B[key] })
        ) {
          inert++;
          continue;
        }
        diffs++;
        byProp[p] = (byProp[p] || 0) + 1;
        if (full || diffs <= 40)
          console.log(`[${state}] ${key}\n    ${p}: ${av} -> ${bv}`);
      }
    }
    for (const key of Object.keys(B)) {
      if (!(key in A)) {
        added++;
        if (full) console.log(`[${state}] NEW ${key}`);
      }
    }
  }
  console.log(
    `\n${diffs} property differences, ${gone} elements gone, ${added} new` +
      (inert ? ` (${inert} more cannot paint -- see isInert)` : ""),
  );
  if (diffs) {
    const worst = Object.entries(byProp).sort((x, y) => y[1] - x[1]);
    console.log("by property:", worst.map(([k, v]) => `${k}=${v}`).join(" "));
  }
  return diffs + gone + added;
}

module.exports = { PROPS, STATES };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  (async () => {
    if (cmd === "capture") {
      const [port, out] = rest;
      if (!port || !out) throw new Error("capture <port> <out.json>");
      await capture(Number(port), out);
    } else if (cmd === "diff") {
      const [before, after] = rest;
      if (!before || !after) throw new Error("diff <before.json> <after.json>");
      // Not an exit code: a difference here is a question, not a failure. Some
      // of them are meant (a component was redesigned) and the point is to read
      // them, which is why the summary groups by property.
      diff(before, after, rest.includes("--full"));
    } else {
      console.error("usage: style-snapshot.js capture <port> <out.json>");
      console.error(
        "       style-snapshot.js diff <before.json> <after.json> [--full]",
      );
      process.exit(1);
    }
  })().catch((err) => {
    console.error("style-snapshot:", err.message);
    process.exit(1);
  });
}

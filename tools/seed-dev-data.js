/**
 * Fill a throwaway data folder with as many tasks as you want, so the app can
 * be opened at a size nobody reaches by hand.
 *
 * The app is fast with the forty-odd tasks a real person has after a month. The
 * things that go wrong -- a list that takes a third of a second to redraw on
 * every keystroke -- only show up in the thousands, and you cannot type your way
 * there. This writes that state directly.
 *
 *   node tools/seed-dev-data.js <folder> [--quad 500] [--history 2000]
 *                                        [--trash 500] [--inbox 200]
 *                                        [--tombstones 0]
 *
 * Then open the app against it. Never against the real folder:
 *
 *   npx electron . --user-data-dir=<folder>
 *
 * `--user-data-dir` replaces app.getPath('userData') wholesale, so the real
 * %APPDATA%\Nekan is untouched and the single-instance lock is a separate one --
 * the app you already have open keeps running.
 *
 * Write data.json *directly* in <folder>, which is what this does. Nesting a
 * Nekan/ inside it is the mistake that looks like it worked: the app finds
 * nothing there and migrateLegacyStore() helpfully imports the real data
 * instead, and then you are testing against your own tasks.
 */

const fs = require("fs");
const path = require("path");

// The build output, not the source: src/shared/ is TypeScript now. Run
// `npm run build` first -- every npm script that matters already does.
const { normalizeTasks, DEFAULT_LAYOUT } = require("../out/shared/core");

const DEFAULTS = {
  quad: 500, // per quadrant, so four times this in the matrix
  history: 2000,
  trash: 500,
  inbox: 200,
  tombstones: 0, // invisible, but they are still rows the store carries
};

/** Long enough to wrap and to be worth searching, like a real one. */
const SUBJECTS = [
  "발표 자료 정리",
  "장바구니 결제 흐름 점검",
  "회고 문서 초안",
  "운동 30분",
  "부모님 생신 선물",
  "세금 자료 모으기",
  "리팩터링 — 중복된 날짜 계산",
  "읽다 만 책 마저 읽기",
  "냉장고 정리",
  "친구 결혼식 답장",
];

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (!(key in DEFAULTS)) {
      console.error(`unknown option --${key}`);
      process.exit(2);
    }
    const value = Number(argv[(i += 1)]);
    if (!Number.isFinite(value) || value < 0) {
      console.error(`--${key} needs a number`);
      process.exit(2);
    }
    opts[key] = Math.floor(value);
  }
  return { target: rest[0], opts };
}

function build(opts, now) {
  const tasks = [];
  let n = 0;
  // Spread the stamps backwards an hour at a time so history groups by date
  // the way it would after months of use, rather than landing in one heap.
  const make = (over) => {
    n += 1;
    const subject = SUBJECTS[n % SUBJECTS.length];
    return {
      id: `seed-${n.toString(36)}`,
      text: `${subject} (${n})`,
      quadrant: "q1",
      space: "work",
      dueDate: null,
      memo: null,
      createdAt: now - n * 3600000,
      updatedAt: now - n * 3600000,
      completedAt: null,
      deletedAt: null,
      purgedAt: null,
      ...over,
    };
  };

  const quads = ["q1", "q2", "q3", "q4"];
  for (const quadrant of quads) {
    for (let i = 0; i < opts.quad; i += 1) {
      // A quarter of them on the life board, so switching spaces is not a
      // no-op and the counts differ between the two.
      tasks.push(make({ quadrant, space: i % 4 === 0 ? "life" : "work" }));
    }
  }
  for (let i = 0; i < opts.history; i += 1) {
    tasks.push(
      make({
        quadrant: quads[i % 4],
        completedAt: now - i * 3600000,
        memo: i % 3 === 0 ? "왜 이렇게 했는지 남겨둔 메모" : null,
      }),
    );
  }
  for (let i = 0; i < opts.trash; i += 1) {
    tasks.push(make({ quadrant: quads[i % 4], deletedAt: now - i * 3600000 }));
  }
  for (let i = 0; i < opts.inbox; i += 1) {
    tasks.push(make({ quadrant: "inbox", space: null }));
  }
  for (let i = 0; i < opts.tombstones; i += 1) {
    tasks.push(make({ text: "", memo: null, purgedAt: now - i * 3600000 }));
  }

  // Through the same normalizer the app loads with, so the seeded file is a
  // file the app could actually have written -- order keys included.
  return normalizeTasks(tasks);
}

function main() {
  const { target, opts } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.error(
      "usage: node tools/seed-dev-data.js <folder> [--quad N] [--history N] [--trash N] [--inbox N] [--tombstones N]",
    );
    process.exit(2);
  }

  const file = path.join(target, "data.json");
  // Refuse the real folder. Overwriting it is not something to find out about
  // afterwards.
  const real = path.join(
    process.env.APPDATA ||
      path.join(require("os").homedir(), "AppData/Roaming"),
    "Nekan",
  );
  if (path.resolve(target) === path.resolve(real)) {
    console.error(
      `refusing to write the real data folder (${real}). Point this at a throwaway one.`,
    );
    process.exit(2);
  }

  const tasks = build(opts, Date.now());
  const store = {
    tasks,
    settings: {
      alwaysOnTop: true,
      bounds: null,
      mode: "expanded",
      theme: "light",
      inboxOpen: false,
      activeSpace: "work",
      barPosition: null,
      layout: { ...DEFAULT_LAYOUT },
    },
  };

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store), "utf8");

  const size = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
  console.log(`${file}  —  ${tasks.length} tasks, ${size}MB`);
  console.log(
    `  quadrants ${opts.quad * 4}  history ${opts.history}  trash ${opts.trash}  inbox ${opts.inbox}  tombstones ${opts.tombstones}`,
  );
  console.log(`\n  npx electron . --user-data-dir=${target}`);
}

main();

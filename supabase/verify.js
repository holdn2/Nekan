// Drive the real Supabase project the way two devices would, and check the
// rules the schema is supposed to enforce.
//
// This is the only thing that proves 0001_tasks.sql still does what it claims.
// npm test covers the client half in shared/sync.js, but last-write-wins and
// the cursor live in a trigger, and a trigger can only be checked by writing to
// it. Run this after every change to the migration.
//
//   NEKAN_SUPABASE_URL=... NEKAN_SUPABASE_ANON_KEY=... node supabase/verify.js
//
// Every run works on its own ids and its own timestamps, taken from the clock.
// The first draft used fixed ones and passed exactly once: the second run's
// writes were older than what the first had left behind, so the trigger threw
// them away -- correctly, which is the point. A check that only holds against
// an empty table is not checking the thing it claims to.
//
// Two throwaway accounts are signed up and left behind; later runs log back
// into them. Rows are buried as tombstones at the end rather than deleted,
// because no client is allowed to delete -- that restriction is itself one of
// the things being tested.

const URL = process.env.NEKAN_SUPABASE_URL;
const ANON = process.env.NEKAN_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error(
    "set NEKAN_SUPABASE_URL and NEKAN_SUPABASE_ANON_KEY (Project Settings -> API)",
  );
  process.exit(2);
}

const ACCOUNTS = {
  mine: ["nekan-dev@example.com", "nekan-dev-9f3k2"],
  other: ["nekan-other@example.com", "nekan-other-7d1m4"],
};

/**
 * EMAIL:PASSWORD of an account this run is allowed to delete, or unset.
 *
 * Optional because it cannot be automated any more -- see the account-deletion
 * section for why -- and because getting it wrong deletes something real.
 * Nothing here ever falls back to ACCOUNTS: those two are rebuilt by hand.
 */
const LEAVING = process.env.NEKAN_VERIFY_LEAVING;

let passed = 0;
let failed = 0;
let skipped = 0;

/**
 * A check that could not be run, which is not the same as one that passed.
 *
 * Kept out of the exit code on purpose: the reasons are about the project's
 * quotas rather than about the schema, and failing the run for them would train
 * everyone to ignore the exit code. Loud in the output instead, and counted in
 * the summary so "23 passed" cannot quietly become "19 passed" unnoticed.
 */
function skip(name, why) {
  skipped += 1;
  console.log(`  SKIP ${name}${why ? "\n       " + why : ""}`);
}

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? "\n       " + detail : ""}`);
  }
}

async function api(pathname, { token, method = "GET", body, prefer } = {}) {
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${token || ANON}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } catch {
    return { status: res.status, body: text };
  }
}

/** Sign up, or log back in if an earlier run already made this account. */
async function session([email, password]) {
  const up = await api("/auth/v1/signup", {
    method: "POST",
    body: { email, password },
  });
  if (up.body?.access_token) return up.body;

  const login = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (login.body?.access_token) return login.body;

  throw new Error(
    `no session for ${email}: ${JSON.stringify(up.body)} / ${JSON.stringify(login.body)}`,
  );
}

/** Upsert the way the client will: merge on the primary key. */
const push = (token, rows) =>
  api("/rest/v1/tasks?on_conflict=user_id,id", {
    token,
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });

const pull = (token, since = 0, limit = 500) =>
  api(
    `/rest/v1/tasks?select=*&server_seq=gt.${since}&order=server_seq.asc&limit=${limit}`,
    { token },
  );

(async () => {
  // Fresh ids and stamps per run, so nothing left behind can decide a result.
  const run = Date.now().toString(36);
  const t0 = Date.now();
  const id = (name) => `verify-${run}-${name}`;

  const mine = await session(ACCOUNTS.mine);
  const other = await session(ACCOUNTS.other);
  const userId = mine.user.id;

  const row = (over = {}) => ({
    user_id: userId,
    id: id("a"),
    text: "처음 쓴 것",
    quadrant: "q1",
    space: "work",
    due_date: null,
    memo: null,
    order_key: "V",
    created_at: t0,
    updated_at: t0,
    completed_at: null,
    deleted_at: null,
    purged_at: null,
    ...over,
  });

  // Ask for the one row by id. Scanning a page for it worked while the table
  // was small and would have started missing rows once the leftovers from
  // earlier runs pushed past the page size -- tombstones are only collected
  // after 90 days, so they pile up long before then.
  const readBack = async (rowId) =>
    (
      await api(`/rest/v1/tasks?select=*&id=eq.${rowId}`, {
        token: mine.access_token,
      })
    ).body?.[0];

  console.log(`\n== 계정 (run ${run}) ==`);
  console.log(`  mine:  ${userId}`);
  console.log(`  other: ${other.user.id}`);

  // Where this account already stood before the run wrote anything. Every check
  // below that walks "everything" walks from here instead, so what earlier runs
  // left behind cannot decide whether this one passes.
  //
  // Asked for directly rather than folded out of a page: reading a page to find
  // the largest value is the same mistake one layer up, and it starts lying at
  // exactly the size that makes it matter.
  const baseline =
    (
      await api(
        "/rest/v1/tasks?select=server_seq&order=server_seq.desc&limit=1",
        {
          token: mine.access_token,
        },
      )
    ).body?.[0]?.server_seq ?? 0;

  console.log("\n== 첫 쓰기 ==");
  const first = await push(mine.access_token, [row()]);
  check("insert가 통과한다", first.status === 201, JSON.stringify(first.body));
  check(
    "server_seq를 서버가 붙여준다",
    Number.isFinite(first.body?.[0]?.server_seq),
    `seq=${first.body?.[0]?.server_seq}`,
  );

  const lied = await push(mine.access_token, [
    { ...row({ id: id("b") }), server_seq: 1 },
  ]);
  check(
    "클라이언트가 보낸 server_seq는 무시된다",
    lied.body?.[0]?.server_seq !== 1,
    `seq=${lied.body?.[0]?.server_seq}`,
  );

  console.log("\n== LWW ==");
  const newer = await push(mine.access_token, [
    row({ text: "더 새것", updated_at: t0 + 10 }),
  ]);
  check(
    "새 updated_at은 이긴다",
    newer.body?.[0]?.text === "더 새것",
    JSON.stringify(newer.body),
  );

  await push(mine.access_token, [
    row({ text: "옛것이 덮으려 함", updated_at: t0 + 5 }),
  ]);
  check(
    "오래된 updated_at은 버려진다",
    (await readBack(id("a"))).text === "더 새것",
  );

  const beforeTie = (await readBack(id("a"))).server_seq;
  await push(mine.access_token, [
    row({ text: "동점으로 덮으려 함", updated_at: t0 + 10 }),
  ]);
  const afterTie = await readBack(id("a"));
  check("동점은 서버가 이긴다", afterTie.text === "더 새것", afterTie.text);
  check(
    "버려진 쓰기는 커서를 움직이지 않는다",
    afterTie.server_seq === beforeTie,
    `${beforeTie} -> ${afterTie.server_seq}`,
  );

  console.log("\n== 묘비 ==");
  await push(mine.access_token, [
    row({ text: "", memo: null, purged_at: t0 + 20, updated_at: t0 + 20 }),
  ]);
  const buried = await readBack(id("a"));
  check("묘비가 행으로 남는다", buried?.purged_at === t0 + 20);
  check("묘비의 내용은 비어 있다", buried?.text === "");

  await push(mine.access_token, [
    row({ text: "살아났다", updated_at: t0 + 15 }),
  ]);
  const stillBuried = await readBack(id("a"));
  check(
    "오래된 수정이 묘비를 되살리지 못한다",
    stillBuried.purged_at === t0 + 20 && stillBuried.text === "",
    `text=${stillBuried.text} purged=${stillBuried.purged_at}`,
  );

  console.log("\n== 지울 수 없다 ==");
  const del = await api(`/rest/v1/tasks?id=eq.${id("a")}`, {
    token: mine.access_token,
    method: "DELETE",
  });
  check(
    "DELETE가 행을 지우지 못한다",
    Boolean(await readBack(id("a"))),
    `status ${del.status}`,
  );

  console.log("\n== 남의 데이터 ==");
  const theirs = await pull(other.access_token, 0);
  check(
    "다른 사용자에게는 내 행이 안 보인다",
    Array.isArray(theirs.body) && theirs.body.length === 0,
    JSON.stringify(theirs.body).slice(0, 200),
  );

  const forged = await push(other.access_token, [
    row({ id: id("stolen"), text: "남의 계정에 쓰기" }),
  ]);
  check(
    "남의 user_id로는 쓸 수 없다",
    forged.status === 403 || forged.status === 401,
    `status ${forged.status} ${JSON.stringify(forged.body).slice(0, 160)}`,
  );

  check(
    "로그아웃 상태로는 읽을 수 없다",
    (await api("/rest/v1/tasks?select=id", {})).status === 401,
  );

  console.log("\n== 커서 ==");
  // From the baseline, so this is what *this* run wrote and nothing else.
  const all = await pull(mine.access_token, baseline);
  const seqs = all.body.map((r) => r.server_seq);
  check(
    "server_seq가 오름차순으로 온다",
    seqs.length > 0 && seqs.every((s, i) => i === 0 || s > seqs[i - 1]),
    JSON.stringify(seqs),
  );
  check(
    "최신 커서 이후로는 빈 페이지",
    (await pull(mine.access_token, Math.max(...seqs))).body.length === 0,
  );

  // A first sync on a new device is the only pull that can outgrow one page,
  // and it is also the one nobody notices going wrong: the missing rows are
  // old ones. Walk it at limit=1 so the paging is exercised rather than
  // assumed. The guard comes from how many rows are actually out there --
  // a fixed one would quietly cut the walk short as runs accumulate, and the
  // check would then fail for a reason that has nothing to do with paging.
  const page = [];
  for (
    let cursor = baseline, guard = 0;
    guard < all.body.length + 5;
    guard += 1
  ) {
    const res = await pull(mine.access_token, cursor, 1);
    if (!res.body.length) break;
    page.push(...res.body.map((r) => r.id));
    cursor = Math.max(...res.body.map((r) => r.server_seq));
  }
  check(
    "커서를 따라가면 한 페이지짜리 응답으로도 전부 받는다",
    page.length === all.body.length &&
      new Set(page).size === page.length &&
      page.every((rowId, i) => rowId === all.body[i].id),
    `${page.length} vs ${all.body.length}`,
  );

  console.log("\n== 계정 삭제 ==");
  // On a throwaway account, and only on one handed in from outside. Deleting
  // either account above would work exactly once and take every later run with
  // it -- which is not hypothetical: nekan-dev was deleted that way on
  // 2026-08-08 and had to be rebuilt from the dashboard.
  //
  // This used to sign one up per run, and that stopped working when the project
  // turned on email confirmation. A signup now answers with a user and *no*
  // session, the password login that follows answers email_not_confirmed, and
  // the confirmation mail goes to an @example.com address nobody can read. The
  // 429 seen first is only the send quota; even with quota to spare there is no
  // way through. So these three checks were quietly dead, and worse than dead:
  // the throw ended the run at this line, so the anon-permission check below
  // and the whole tombstone section never ran and no summary printed.
  //
  // To run them: make a user in the dashboard (Authentication -> Users -> Add
  // user, Auto Confirm on) and pass it in. It is consumed -- the point of the
  // check is that the account is gone afterwards -- so a new one is needed each
  // time, which is why this is opt-in rather than the default.
  //
  //   NEKAN_VERIFY_LEAVING=someone@example.com:password node supabase/verify.js
  let leaving = null;
  if (!LEAVING) {
    skip(
      "계정 삭제 4가지 — 지워도 되는 계정이 없다",
      "NEKAN_VERIFY_LEAVING=<이메일>:<비밀번호> 로 넘기면 돈다 (대시보드에서 Auto Confirm으로 만든 일회용 계정). 그 계정은 이 검사로 사라진다.",
    );
  } else {
    const cut = LEAVING.indexOf(":");
    const leavingEmail = cut < 0 ? LEAVING : LEAVING.slice(0, cut);
    const leavingPassword = cut < 0 ? "" : LEAVING.slice(cut + 1);
    // Never a signup: this account is made by hand, and an accidental signup
    // here would burn the send quota for the run that actually needs it.
    const got = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: leavingEmail, password: leavingPassword },
    });
    if (got.body?.access_token) {
      leaving = { ...got.body, email: leavingEmail, password: leavingPassword };
    } else {
      skip(
        "계정 삭제 4가지 — 넘겨준 계정으로 로그인하지 못했다",
        `${leavingEmail}: ${JSON.stringify(got.body).slice(0, 160)}`,
      );
    }
  }

  if (leaving) {
    await push(leaving.access_token, [
      {
        ...row({ id: id("leaving") }),
        user_id: leaving.user.id,
      },
    ]);
    const hadRow = (await pull(leaving.access_token, 0)).body.length === 1;

    const gone = await api("/rest/v1/rpc/delete_account", {
      token: leaving.access_token,
      method: "POST",
      body: {},
    });
    check(
      "본인 계정을 지울 수 있다",
      gone.status === 200 || gone.status === 204,
      `status ${gone.status} ${JSON.stringify(gone.body).slice(0, 160)}`,
    );

    const after = await pull(leaving.access_token, 0);
    // Two claims, kept apart, because together they said more than the answer
    // supports. A 401 proves the token died with the account -- it is not
    // evidence that the rows went with it, and a delete_account() that dropped
    // the user but left tasks behind would have passed the combined version.
    //
    // The cascade itself cannot be shown from here: proving it means counting
    // another user's rows, and the only credential that can do that is
    // service_role, which this project deliberately does not hold -- it
    // bypasses the RLS that every other check in this file depends on. The
    // constraint is declared in 0001_tasks.sql; what is checked here is that
    // the account is unreachable afterwards.
    check("지우기 전에 그 계정에 할 일이 있었다", hadRow, `had=${hadRow}`);
    check(
      "지운 계정의 토큰으로는 아무것도 읽히지 않는다",
      after.status === 401 || after.body.length === 0,
      `status=${after.status} ${JSON.stringify(after.body).slice(0, 120)}`,
    );

    const relogin = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: leaving.email, password: leaving.password },
    });
    check(
      "지운 계정으로는 다시 로그인되지 않는다",
      !relogin.body?.access_token,
      JSON.stringify(relogin.body).slice(0, 160),
    );
  }

  // Not inside the branch above: this one needs no account at all, and it is
  // the check that says the RPC is not open to the world.
  const anonRpc = await api("/rest/v1/rpc/delete_account", {
    method: "POST",
    body: {},
  });
  check(
    "로그인하지 않고는 삭제를 부를 수 없다",
    anonRpc.status !== 200 && anonRpc.status !== 204,
    `status ${anonRpc.status}`,
  );

  console.log("\n== 묘비 청소 예약 ==");
  const cron = await api("/rest/v1/rpc/purge_expired_tombstones", {
    token: mine.access_token,
    method: "POST",
    body: {},
  });
  check(
    "청소 함수는 클라이언트가 직접 못 부른다",
    cron.status !== 200 && cron.status !== 204,
    `status ${cron.status}`,
  );

  // Bury this run's leftovers. They cannot be deleted -- that is the rule being
  // tested above -- so they leave the only way anything leaves.
  await push(
    mine.access_token,
    [id("a"), id("b")].map((rowId) =>
      row({
        id: rowId,
        text: "",
        memo: null,
        purged_at: t0 + 30,
        updated_at: t0 + 30,
      }),
    ),
  );

  console.log(
    `\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}\n`,
  );
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("\nverification blew up:", err.message);
  process.exit(1);
});

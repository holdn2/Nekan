/**
 * Due dates: parsing them, classifying them, and wording them in either language.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  startOfToday,
  startOfTomorrow,
  parseDue,
  dueInfo,
  formatDue,
} from "#shared/core.js";
import { initI18n, setMainLanguage, t } from "#main/i18n.js";

function dayString(offset: number, base?: Date) {
  const d = startOfToday(base);
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test("parseDue accepts only real YYYY-MM-DD days", () => {
  assert.equal(parseDue("2026-02-31"), null);
  assert.equal(parseDue("2026-13-01"), null);
  assert.equal(parseDue("26-01-01"), null);
  assert.equal(parseDue(""), null);
  assert.equal(parseDue(null), null);
  assert.equal(parseDue("2026-03-09").getDate(), 9);
});

test("dueInfo classifies days relative to today", () => {
  // No strings in here on purpose: dueInfo counts days and names the state the
  // stylesheet colours by, and the words are formatDue's problem below.
  assert.equal(dueInfo(dayString(-2)).state, "overdue");
  assert.equal(dueInfo(dayString(-2)).days, -2);
  assert.equal(dueInfo(dayString(0)).state, "today");
  assert.equal(dueInfo(dayString(1)).days, 1);
  assert.equal(dueInfo(dayString(1)).state, "soon");
  assert.equal(dueInfo(dayString(3)).state, "soon");
  assert.equal(dueInfo(dayString(4)).state, "far");
  assert.equal(dueInfo(null), null);
});

test("dueInfo is relative to the day it is asked about, not the parse", () => {
  const due = "2026-03-10";
  const before = new Date(2026, 2, 9, 23, 59, 59);
  const after = new Date(2026, 2, 10, 0, 0, 1);
  assert.equal(dueInfo(due, before).state, "soon");
  assert.equal(dueInfo(due, before).days, 1);
  // Same task, one second later: the label must move on its own.
  assert.equal(dueInfo(due, after).state, "today");
});

test("dueInfo flags a date in another year, because now is only here", () => {
  const now = new Date(2026, 5, 1);
  assert.equal(dueInfo("2026-06-10", now).otherYear, false);
  assert.equal(dueInfo("2027-06-10", now).otherYear, true);
});

test("formatDue words the same date in whichever language it is given", () => {
  const now = new Date(2026, 5, 1);
  const at = (value) => dueInfo(value, now);

  initI18n("ko");
  assert.equal(formatDue(at(dayString(1, now)), t, "ko").hint, "내일");
  assert.equal(formatDue(at(dayString(0, now)), t, "ko").hint, "오늘");
  assert.equal(formatDue(at(dayString(-2, now)), t, "ko").hint, "2일 지남");
  assert.equal(formatDue(at(dayString(5, now)), t, "ko").hint, "5일 남음");

  setMainLanguage("en");
  assert.equal(formatDue(at(dayString(1, now)), t, "en").hint, "Tomorrow");
  // The plural comes from i18next's own rules, never from appending an "s".
  assert.equal(
    formatDue(at(dayString(-1, now)), t, "en").hint,
    "1 day overdue",
  );
  assert.equal(
    formatDue(at(dayString(-2, now)), t, "en").hint,
    "2 days overdue",
  );
  assert.equal(formatDue(at(dayString(5, now)), t, "en").hint, "5 days left");
  setMainLanguage("ko");
});

test("formatDue writes the year only when it differs from now", () => {
  const now = new Date(2026, 5, 1);
  initI18n("ko");
  assert.equal(formatDue(dueInfo("2026-06-10", now), t, "ko").text, "6/10(수)");
  assert.equal(
    formatDue(dueInfo("2027-06-10", now), t, "ko").text.startsWith("27/"),
    true,
  );
  // The weekday is the one part Intl already knows in every language.
  assert.equal(
    formatDue(dueInfo("2026-06-10", now), t, "en").text,
    "6/10(Wed)",
  );
  assert.equal(formatDue(null, t, "ko"), null);
});

test("startOfTomorrow lands on the next local midnight", () => {
  const now = new Date(2026, 2, 9, 17, 30, 12, 400);
  const next = startOfTomorrow(now);
  assert.equal(next.getDate(), 10);
  assert.equal(next.getHours(), 0);
  assert.equal(next.getMinutes(), 0);
  assert.ok(next.getTime() > now.getTime());
});

/**
 * The title bar, and specifically the three things that stopped being CSS.
 *
 * Two of them are states that only exist under the pointer, which is where the
 * old sheet's ordering did the work: `.win-btn.on` and `.win-btn:hover` had the
 * same specificity, and `.on` came later, so a pinned button kept its accent
 * while hovered. Utilities have no such tie -- a `hover:` variant outranks a
 * plain one -- so each accented button has to name its own hover, and that is
 * exactly the kind of thing a resting snapshot cannot see. It was missed once
 * here already.
 *
 * The third is the drag boundary: the row is what the user grabs to move the
 * window, and every control in it has to opt out or it becomes a dead zone.
 */

import { beforeEach, expect, test } from "vitest";

import { applyPinned, applyUpdateStatus } from "../state.js";
import { find, mount } from "../../../react/testing.js";
import { setLanguage } from "../../../i18n.js";
import { setTasks } from "../../../store.js";
import { TitleBar } from "../title-bar.js";

/** Every class the button carries, so a missing one cannot hide in a substring. */
const classes = (selector: string) => [...find(selector).classList];

beforeEach(async () => {
  document.body.replaceChildren();
  setTasks([]);
  await setLanguage("ko");
  applyPinned(false);
  applyUpdateStatus({ state: "idle", version: null });
});

test("the update button is only there once there is an update to take", async () => {
  const view = await mount(<TitleBar />);

  expect(classes("#updateBtn")).toContain("hidden");

  await view.flush(() =>
    applyUpdateStatus({ state: "ready", version: "1.0.1" }),
  );
  expect(classes("#updateBtn")).not.toContain("hidden");
});

test("an accented button keeps its accent under the pointer", async () => {
  const view = await mount(<TitleBar />);

  // Unpinned: the shared window-button hover, and no accent.
  expect(classes("#pinBtn")).toContain("hover:bg-panel-3");
  expect(classes("#pinBtn")).not.toContain("bg-accent-soft");

  await view.flush(() => applyPinned(true));

  // Pinned: accent at rest, and the same accent named for hover -- without
  // which cn() leaves the grey hover in place and the pin fades when reached
  // for. tailwind-merge drops hover:bg-panel-3 because a later class in the
  // same group replaces it.
  expect(classes("#pinBtn")).toContain("bg-accent-soft");
  expect(classes("#pinBtn")).toContain("hover:bg-accent-soft");
  expect(classes("#pinBtn")).toContain("hover:text-accent");
  expect(classes("#pinBtn")).not.toContain("hover:bg-panel-3");
});

test("the update button does the same, and says it in danger's absence", async () => {
  const view = await mount(<TitleBar />);
  await view.flush(() =>
    applyUpdateStatus({ state: "ready", version: "1.0.1" }),
  );

  expect(classes("#updateBtn")).toContain("bg-accent-soft");
  expect(classes("#updateBtn")).toContain("hover:bg-accent-soft");
  expect(classes("#updateBtn")).not.toContain("hover:bg-panel-3");
});

test("close is the one window button that turns red", async () => {
  await mount(<TitleBar />);

  expect(classes("#closeBtn")).toContain("hover:bg-danger-soft");
  expect(classes("#closeBtn")).toContain("hover:text-danger");
  // Every other one keeps the neutral hover.
  expect(classes("#minBtn")).toContain("hover:bg-panel-3");
  expect(classes("#minBtn")).not.toContain("hover:bg-danger-soft");
});

test("everything the user can click opts out of the drag region", async () => {
  await mount(<TitleBar />);

  const noDrag = "[-webkit-app-region:no-drag]";
  // The switch, the counts and the window buttons each carry it. The row
  // itself is the drag handle and lives in index.html, which is why it is not
  // asserted here.
  expect(classes(".switch")).toContain(noDrag);
  expect(classes(".bar-summary")).toContain(noDrag);
  expect(find("#closeBtn").closest(`.${CSS.escape(noDrag)}`)).not.toBeNull();
});

test("the names bar mode reaches by are still on the markup", async () => {
  await mount(<TitleBar />);

  // collapsed.css hides and reshapes these by name and nothing defines them
  // any more. A rename here is invisible until someone collapses the window.
  for (const name of ["title", "app-version", "bar-summary"]) {
    expect(document.querySelectorAll(`.${name}`).length).toBe(1);
  }
  expect(document.querySelectorAll(".chip").length).toBeGreaterThan(0);
});

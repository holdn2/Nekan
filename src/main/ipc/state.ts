/**
 * The two channels the renderer opens with: read everything, write it back.
 *
 * state:load carries more than tasks. mode, update, version and auth all ride
 * along because each is main's to decide and each is also pushed, so a renderer
 * that starts -- or reloads -- after the fact still has the current answer
 * without a channel of its own. `auth` is an email or null, never a token.
 */

import { app, ipcMain } from "electron";
import { getMode } from "../window";
import { getClockOffset, getPublicSession } from "../api-client";
import { getSettings, getStore, mergeRendererTasks, persist } from "../store";
import { getUpdateStatus } from "../updater";
import { getSyncStatus, syncSoon } from "../sync";
import { language } from "../i18n";

function registerStateIpc() {
  /* ------------------------------------------------------------- state */

  // `mode` and `update` ride along for the same reason: both are main's to
  // decide and both are also pushed, so a renderer that starts (or reloads)
  // after the fact still has the current answer without asking for it.
  //
  // `version` rides along because it would be a whole channel for one string
  // that never changes while the app is running. It comes from app.getVersion()
  // rather than package.json: in a packaged build that file is a copy inside
  // the asar, and this is the number electron is actually running.
  //
  // `auth` is the email of whoever is logged in, or null -- never a token.
  // It rides along for the same reason as the rest: it is main's to know, it
  // is restored from disk before the window exists, and a renderer that
  // reloads has to be able to find out again without a channel of its own.
  ipcMain.handle("state:load", () => ({
    tasks: getStore().tasks,
    settings: getSettings(),
    mode: getMode(),
    update: getUpdateStatus(),
    version: app.getVersion(),
    auth: getPublicSession(),
    clockOffset: getClockOffset(),
    sync: getSyncStatus(),
    // Whether this build offers a password field at all. The guide reads it so
    // a development run can say so out loud instead of looking broken.
    devLogin: !app.isPackaged,
  }));

  // Merged, not replaced: a pull can have landed since the renderer last drew,
  // and those rows are not in the list it is sending back.
  ipcMain.handle("state:save", (_e, tasks) => {
    mergeRendererTasks(tasks);
    persist();
    syncSoon();
    return true;
  });
}

export { registerStateIpc };

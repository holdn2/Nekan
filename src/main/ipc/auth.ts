/**
 * Signing in, signing out, and deleting the account.
 *
 * No channel here returns a token, which is what keeps a compromised renderer
 * from being a stolen account. They all resolve with `{ ok: false, error }`
 * rather than rejecting: being offline is the normal state of a sync client,
 * not an exception.
 *
 * The local tasks stay where they are through all of it. They were the user's
 * before there was an account, and the app has to keep working without one.
 */

import { app, ipcMain } from "electron";
import type { PublicSession } from "../../shared/types";
import { deleteAccount, login, loginWithGoogle, logout } from "../api-client";
import { cancelSignIn } from "../oauth";
import { backupStore, getStore, persistNow, setTasks } from "../store";
import { announceTasks, syncAccount } from "../sync";

/** Where a sign-in puts the local tasks it was asked not to merge. */
const PRE_LOGIN_BACKUP = "data.before-login.json";

function registerAuthIpc() {
  /* -------------------------------------------------------------- auth */

  // No channel here returns a token, which is what keeps a compromised
  // renderer from being a stolen account -- credentials never leave this
  // process. They all resolve with `{ ok: false, error }` rather than
  // rejecting: being offline is the normal state of a sync client, not an
  // exception.

  /**
   * What a fresh sign-in does with the tasks already on this machine.
   *
   * "merge" is the ordinary case -- a second machine of one's own, where every
   * local task should end up in the account. "replace" is the one that saves
   * somebody: signing in on a borrowed computer would otherwise push a
   * stranger's list into your account, permanently and invisibly. Even then the
   * rows are copied aside first, because being asked to leave them out is not
   * being asked to destroy them.
   */
  function adoptLocalTasks(mode: string) {
    if (mode !== "replace") return;
    // Nothing is cleared unless the copy is actually on disk. writeStore can
    // fail -- a full disk, a locked file -- and clearing anyway would destroy
    // the very list this branch exists to preserve. Falling back to a merge
    // sends the tasks up instead, which is not what was asked for but is the
    // only other answer that keeps them.
    if (!backupStore(PRE_LOGIN_BACKUP)) {
      console.error("pre-login backup failed; keeping the local tasks");
      return;
    }
    setTasks([]);
    persistNow();
    // The window is still showing the rows that were just set aside, and its
    // next save would merge every one of them back in. Waiting for the pull to
    // correct it does not work: an account with nothing new applies nothing.
    announceTasks();
  }

  async function afterSignIn(
    result: { ok?: boolean; session?: PublicSession | null },
    mode: string,
  ) {
    if (!result.ok || !result.session) return result;
    // No user id, nothing to scope a sync to -- and syncAccount(null) would
    // quietly turn syncing off, leaving a signed-in app whose tasks never go
    // anywhere. Worse in "replace" mode, where the local list is already
    // aside. Reported as a failed sign-in instead, before anything is moved.
    //
    // The session is dropped too. api-client has already stored it, and saying
    // "로그인하지 못했습니다" while state:load hands the renderer an email is a
    // worse state than either answer on its own.
    if (!result.session.userId) {
      await logout();
      return { ok: false, error: "bad_response" };
    }
    adoptLocalTasks(mode);
    // Resets the cursor, so signing in as somebody else cannot inherit the last
    // account's idea of being up to date.
    syncAccount(result.session.userId);
    return result;
  }

  ipcMain.handle("auth:google", async (_e, mode) =>
    afterSignIn(await loginWithGoogle(), mode),
  );

  // The browser tab is still open and this process is still holding a port.
  ipcMain.handle("auth:cancel", () => cancelSignIn());

  // Password sign-in is a development affordance, not a feature: sync has to be
  // testable without a person clicking a consent screen. Registering it only
  // outside a packaged build means the shipped app has no such channel at all,
  // so the renderer could not use it even if something in there tried.
  if (!app.isPackaged) {
    ipcMain.handle("auth:login", async (_e, email, password, mode) =>
      afterSignIn(
        await login(String(email || ""), String(password || "")),
        mode,
      ),
    );
  }

  // The local tasks stay exactly where they are. They were the user's before
  // there was an account, and this app has to keep working without one.
  ipcMain.handle("auth:logout", async () => {
    const result = await logout();
    syncAccount(null);
    return result;
  });

  // Same promise as logout, and for the same reason: the list on this computer
  // was the user's before there was an account to put it in. Deleting the
  // account is about the copy on the server -- this one stays, and the panel
  // says so before the button is pressed.
  //
  // syncAccount(null) only when the local session was actually ended, which is
  // narrower than "the delete succeeded". It clears the cursor and the push
  // watermark: after a failed delete that would leave a signed-in app that has
  // forgotten how far it had got, and after a delete whose session was replaced
  // mid-flight it would clear those for whoever is signed in *now*.
  ipcMain.handle("account:delete", async () => {
    const result = await deleteAccount();
    if (result.ok && result.signedOut) syncAccount(null);
    return result;
  });
}

export { registerAuthIpc };

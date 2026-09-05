/**
 * The session on disk, encrypted by the phone.
 *
 * `expo-secure-store` is the Keychain on iOS and the Keystore-backed shared
 * preferences on Android, which is the phone's answer to what `safeStorage`
 * is on the desktop. The point is the same on both: a refresh token is a
 * long-lived credential, and a plain file in the app's sandbox is readable by
 * anything that gets a look at a backup.
 *
 * It does not go in `data.json`. The board is a document the person may copy
 * around; a credential is not, and the two having different lifetimes is
 * easier to keep true when they are different files.
 *
 * Every call can fail -- a locked keychain, a device with no secure hardware,
 * a value written by an older version. A failure is read as "no session",
 * which signs the person out rather than crashing them out. That is the same
 * choice `store/persist.ts` makes about a corrupt board: a start with nothing
 * beats no start at all.
 */
import * as SecureStore from "expo-secure-store";
import { sessionFromStored } from "@nekan/shared/auth";
import type { Session } from "@nekan/shared/types";

/** One key. The value is the whole session as JSON. */
const KEY = "nekan.session";

export async function readSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    return sessionFromStored(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Store a session, or remove the stored one. Says whether it worked.
 *
 * The answer matters in one direction more than the other. A failed write
 * leaves an older session on disk, which the next launch will try, fail to
 * renew, and drop -- annoying. A failed *delete* leaves a live session on disk
 * after somebody signed out, and the next launch signs them back in. So a
 * delete that will not go through is turned into a value that cannot be read
 * back as a session, which reaches the same place by another road.
 */
export async function writeSession(session: Session | null): Promise<boolean> {
  try {
    if (!session) return await removeSession();
    await SecureStore.setItemAsync(KEY, JSON.stringify(session), {
      // The session is only ever needed while somebody is using the app, and
      // this is the strictest option that still survives a restart. It also
      // keeps the token off a device that has no passcode at all.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch (err) {
    // The next launch will find the older session, fail to renew it and ask
    // the person to sign in -- which is the honest outcome, but not one worth
    // reaching in silence.
    console.warn("[nekan] could not store the session", err);
    return false;
  }
}

/**
 * Delete the stored session, or failing that make it unreadable.
 *
 * A keychain can refuse. Reporting that and stopping would leave the session
 * on disk for the next launch to restore, so the fallback overwrites it with
 * a value `readSession` cannot parse -- signed out is signed out, and an
 * entry that reads back as nothing is as good as no entry.
 */
async function removeSession(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(KEY);
    return true;
  } catch (err) {
    console.warn("[nekan] could not delete the session", err);
  }
  try {
    await SecureStore.setItemAsync(KEY, "");
    return true;
  } catch (err) {
    console.warn("[nekan] could not invalidate the session either", err);
    return false;
  }
}

export const clearSession = (): Promise<boolean> => writeSession(null);

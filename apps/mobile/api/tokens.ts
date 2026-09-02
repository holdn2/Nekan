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

export async function writeSession(session: Session | null): Promise<void> {
  try {
    if (!session) {
      await SecureStore.deleteItemAsync(KEY);
      return;
    }
    await SecureStore.setItemAsync(KEY, JSON.stringify(session), {
      // The session is only ever needed while somebody is using the app, and
      // this is the strictest option that still survives a restart. It also
      // keeps the token off a device that has no passcode at all.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Nothing to do and nothing to say: the next launch will find no session
    // and ask the person to sign in, which is the honest outcome.
  }
}

export const clearSession = (): Promise<void> => writeSession(null);

/**
 * The session on disk, encrypted by the OS.
 *
 * Deliberately not in data.json. That file is the one users copy to back up
 * their tasks, the one tools/seed-dev-data.js writes and the one the export
 * reads; credentials must not ride along with any of that. This is its own
 * file, and losing it costs a login and nothing else.
 *
 * safeStorage is main-process only and needs the app to be ready, so nothing
 * here may run before whenReady.
 */

import type { Session } from "../shared/types";
import fs from "fs";
import path from "path";
import { app, safeStorage } from "electron";

import { sessionFromStored } from "../shared/auth";

/** Bumped only if the stored shape changes; an unknown version is discarded. */
const FORMAT = 1;

function authPath() {
  return path.join(app.getPath("userData"), "auth.json");
}

/**
 * Whether the OS will encrypt for us.
 *
 * False on a Linux desktop with no keyring available. Login is refused in that
 * case rather than falling back to plain text: a readable token file is the
 * whole account, and an app that quietly downgrades its own storage is worse
 * than one that says it cannot do the thing.
 */
function canStore() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** The stored session, or null for missing, unreadable or foreign contents. */
function readSession() {
  if (!canStore()) return null;
  try {
    const file = JSON.parse(fs.readFileSync(authPath(), "utf8"));
    if (file.v !== FORMAT || typeof file.cipher !== "string") return null;
    const plain = safeStorage.decryptString(Buffer.from(file.cipher, "base64"));
    return sessionFromStored(JSON.parse(plain));
  } catch {
    // Every failure here is the same answer: not logged in. A file encrypted
    // for another OS user, or on another machine, lands here too.
    return null;
  }
}

/**
 * Replace the stored session. Temp file + rename, for the same reason
 * store-io.js does it: a write cut in half would read back as a logout.
 */
function writeSession(session: Session | null) {
  if (!canStore()) return false;
  const target = authPath();
  const tmp = `${target}.tmp`;
  try {
    const cipher = safeStorage
      .encryptString(JSON.stringify(session))
      .toString("base64");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ v: FORMAT, cipher }), "utf8");
    fs.renameSync(tmp, target);
    return true;
  } catch {
    // No token in the message: this one can reach a log file.
    console.error("failed to save the session");
    return false;
  }
}

/** Remove the stored session. A missing file is already the wanted state. */
function clearSession() {
  try {
    fs.rmSync(authPath(), { force: true });
    return true;
  } catch {
    return false;
  }
}

export { authPath, canStore, readSession, writeSession, clearSession };

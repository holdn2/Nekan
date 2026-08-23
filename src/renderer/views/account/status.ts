/**
 * What main has told the renderer about the account, and how to word it.
 *
 * These are pushed values, not something a render can derive: main knows who
 * is signed in and how the sync loop is doing, and it says so whenever that
 * changes. Held here so the panel and the gear read the same answer, and so a
 * language change re-words it rather than leaving the last sentence behind.
 */

import type { PublicSession } from "../../../shared/types.js";
import { t } from "../../i18n.js";
import { notify } from "../../render-bus.js";
import { toast } from "../../components/toast.js";

interface SignInResult {
  ok?: boolean;
  error?: string;
  session?: PublicSession | null;
  /** Whether the delete also ended the session it was for. */
  signedOut?: boolean;
}

/** What main reports on the sync channel. `pending` is worked out from it. */
interface SyncStatus {
  state: string;
  unsent: number;
  session?: PublicSession | null;
}

/**
 * What main has told us, kept outside the component.
 *
 * These arrive as pushes rather than as anything the panel asked for, and they
 * can land before it is on screen -- the settings popover is closed most of the
 * time. Holding them here and announcing means the panel is right whenever it
 * does open, and the same values survive a language change.
 */
let session: PublicSession | null = null;
let status: SyncStatus | null = null;
/** Whether this build has the development password channel at all. */
let devLogin = false;

/** Show the signed-in half or the signed-out half. */
function applySession(next: PublicSession | null) {
  session = next;
  notify();
}

/** The words in the panel, and the dot on the gear. */
function applySyncStatus(next: SyncStatus | null) {
  status = next;
  notify();
}

/** Called once from init, before the first applySession. */
function setDevLogin(enabled: unknown) {
  devLogin = Boolean(enabled);
  notify();
}

/**
 * An edit that had not been sent yet lost to another device's version.
 *
 * Said out loud, unlike a network failure. `실패는 조용히` is about things the
 * user cannot act on; this is the one sync outcome where something they wrote
 * is gone and they may want to write it again.
 */
function announceOverwritten(count: number) {
  if (!count) return;
  toast(t("account.overwritten", { count }), { ms: 8000 });
}

/** Failure codes worth naming. Anything else is shown as itself. */
const REASONS: Record<string, string> = {
  offline: "account.error.offline",
  timeout: "account.error.timeout",
  denied: "account.error.cancelled",
  access_denied: "account.error.cancelled",
  cancelled: "account.error.cancelled",
  no_browser: "account.error.noBrowser",
  no_loopback: "account.error.noLoopback",
  no_secure_storage: "account.error.noSecureStorage",
  flow_state_not_found: "account.error.expired",
  bad_response: "account.error.badResponse",
  no_session: "account.error.noSession",
};

/** A failure code as a sentence. An unknown one is shown as itself — a code on
 *  screen is something a user can quote and I can search for. */
function reasonFor(code: string, fallbackKey: string) {
  if (code in REASONS) return REASONS[code] ? t(REASONS[code]) : "";
  return t(fallbackKey, { code });
}

/** What the four states are called, in the settings panel. */
const LABELS: Record<string, string | null> = {
  off: null,
  syncing: "account.state.syncing",
  synced: "account.state.synced",
  pending: "account.state.pending",
  offline: "account.state.offline",
};

/**
 * `pending` is not a state main reports -- it is `synced` with something still
 * waiting. Deciding it here keeps main's status to facts and leaves the
 * wording in one place.
 */
function displayState(from: SyncStatus | null): string {
  if (!from || from.state === "off") return "off";
  if (from.state === "synced" && from.unsent > 0) return "pending";
  return from.state;
}

/**
 * A message the panel is showing, as a function rather than a string.
 *
 * The language picker is in this very panel, so a sign-in result can be on
 * screen when the language changes. A thunk carries the interpolated bits (an
 * email, an error code) along without this file having to store them.
 */
type Message = { render: () => string; isError: boolean } | null;

export type { Message, SignInResult, SyncStatus };
export {
  currentSession,
  currentStatus,
  devLoginOffered,
  applySession,
  applySyncStatus,
  setDevLogin,
  announceOverwritten,
  reasonFor,
  LABELS,
  displayState,
};

/** Reads, so a caller cannot hold a value past the moment it was true. */
const currentSession = () => session;
const currentStatus = () => status;
const devLoginOffered = () => devLogin;

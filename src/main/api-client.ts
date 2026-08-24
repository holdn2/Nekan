/**
 * The one place this app talks to Supabase.
 *
 * The renderer never sees a token. It asks for auth:login and gets back an
 * email address; window.api has no function that returns one, so a compromised
 * renderer has nothing to take. safeStorage being main-only forces this shape
 * anyway -- it is just as well that it is also the right one.
 *
 * The pieces are in api/ beside this file. This list is written out rather than
 * `export *`, unlike the barrels in shared/: the modules below have to hand
 * each other the live session and the renewal in flight, and those are exactly
 * the names that must not leave here.
 */

export { SUPABASE_URL, request } from "./api/http";
export { initAuth, getPublicSession, getAccessToken } from "./api/session";
export { getClockOffset } from "./api/http";
export { loginWithGoogle, login, signup } from "./api/sign-in";
export { logout, deleteAccount } from "./api/account";

/**
 * The loop that keeps this device and the server the same: pull what arrived,
 * push what has not left yet.
 *
 * All of the hard decisions were made elsewhere. shared/sync.js says which of
 * two versions of a task wins, what still needs sending and where the cursor
 * moved to, and it is covered by npm test. This file's folder is the
 * scheduling, the HTTP and the retries around it -- and the two things a pure
 * function cannot hold: when to run, and what to do when the network says no.
 *
 * It never deletes a local task. Logging out leaves the file exactly as it is,
 * because the tasks were the user's before an account existed and the app has
 * to keep working when the server does not.
 */

export { getSyncStatus } from "./sync/status";
export { initSync, announceTasks, syncSoon, syncAccount } from "./sync/loop";

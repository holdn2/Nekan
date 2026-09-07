/**
 * Sync the moment the machine says it is back on the network.
 *
 * Without this the loop finds out on its own schedule, which after a run of
 * failures is a minute away -- and a minute of "오프라인" on a screen whose
 * network came back is the app looking broken while being fine.
 *
 * It goes through the same channel the button uses, so it also resets the
 * backoff. Coming back online is exactly the moment the ladder built up while
 * disconnected stops meaning anything.
 *
 * `online` is the browser's word for "this machine has an interface again",
 * not "the server answers". It can fire onto a captive portal or a dead
 * uplink; the run that follows then fails and the ladder starts over, which
 * costs one request and is the right shape for a guess.
 *
 * In the renderer rather than in main because main has nothing that reports
 * this -- powerMonitor covers sleep and not connectivity, and asking Chromium
 * from the process that already has it is cheaper than teaching main to poll.
 */

export function wireNetwork() {
  window.addEventListener("online", () => {
    void window.api.syncNow();
  });
}

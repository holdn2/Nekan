/**
 * Tells React that these tests know about act().
 *
 * Without it React runs its updates outside the act queue, warns about it on
 * stderr, and -- worse than the warning -- lets a test read the DOM before the
 * update it just triggered has landed. Three tests failed that way before this
 * file existed, and they failed intermittently, which is the expensive kind.
 */
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {};

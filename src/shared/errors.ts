/**
 * What to show a person when something threw.
 *
 * Six places were spelling this the same way, on both sides of the IPC
 * boundary, and under `strict` none of them compiled: a caught value is
 * `unknown`, because anything can be thrown and usually what is thrown is not
 * an Error at all -- a rejected IPC call answers with a plain object, and
 * `throw "nope"` is legal.
 *
 * The string is going on screen and into a message the user may quote back, so
 * it falls through to String() rather than to a shrug: an ugly code is still a
 * code somebody can search for, and "something went wrong" is not.
 */
export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

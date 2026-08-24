/**
 * Build a className out of parts, dropping the ones that are not there.
 *
 * Utility class lists get long and most of them have a conditional in the
 * middle, which as a template literal means counting spaces by eye:
 *
 *     `toast${error ? " border-danger" : " border-line-strong"}${open ? "" : " hidden"}`
 *
 * A missing space silently welds two class names into one that matches
 * nothing, and a spare one is invisible. This takes the spaces out of the
 * author's hands.
 *
 * **It does not resolve conflicts.** `cn("p-md", "p-lg")` returns both, and
 * which one wins is then decided by the order Tailwind happened to emit them
 * in, which is not something to rely on. That is what `tailwind-merge` is for,
 * and it is deliberately not a dependency here: it is several kilobytes to fix
 * a problem that writing the conditional properly does not have. Put the choice
 * in the argument -- `cond ? "p-md" : "p-lg"` -- rather than passing both and
 * hoping.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const name of part.split(/\s+/)) if (name) out.push(name);
  }
  return out.join(" ");
}

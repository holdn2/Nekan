/**
 * How far this machine's clock is from the server's.
 *
 * `updatedAt` decides who wins a merge, so a device ten minutes slow loses
 * every edit it makes and never hears about it. The offset is measured from
 * the Date header of a reply and added to Date.now() wherever the renderer
 * writes a timestamp.
 */

/**
 * How far a fresh sample has to be from the offset in hand before it is worth
 * believing.
 *
 * Two things make small samples meaningless. The Date header has one-second
 * resolution, and it was written when the server began the reply rather than
 * when we finished reading it, so every sample is a little low by however long
 * the response spent on the wire. Neither matters: this correction exists to
 * catch a clock that is minutes or hours out, not milliseconds.
 */
export const CLOCK_TOLERANCE_MS = 2000;

/**
 * Server time minus ours, read off a response's Date header.
 *
 * NaN when the header is missing or unreadable, and the distinction matters:
 * zero is a real measurement ("the clocks agree"), and returning it for "no
 * idea" made one header-less reply -- a proxy, an error path -- look like a
 * correction back to zero. A device that had learned it was ten minutes out
 * would throw that away and start stamping with its own wrong clock again.
 * nextOffset() already refuses a sample it cannot read.
 */
export function clockOffset(
  dateHeader: string | null | undefined,
  receivedAt: number,
): number {
  if (!dateHeader) return NaN;
  const server = Date.parse(dateHeader);
  if (!Number.isFinite(server)) return NaN;
  return server - receivedAt;
}

/**
 * The offset to keep, given the one in hand and a fresh sample.
 *
 * Sampling noise must not move it. `updatedAt` decides who wins on two devices,
 * so an offset that jitters by a few hundred milliseconds every request would
 * make the order of two edits depend on which reply happened to arrive first.
 */
export function nextOffset(
  current: number,
  sample: number,
  tolerance: number = CLOCK_TOLERANCE_MS,
): number {
  const now = Number.isFinite(current) ? current : 0;
  if (!Number.isFinite(sample)) return now;
  return Math.abs(sample - now) >= tolerance ? sample : now;
}

/**
 * The two inline SVG icons. They are built in JS rather than dropped into
 * index.html because both ride on elements the renderer creates per task.
 *
 * Both stroke with `currentColor`, so the theme and the row's own state (an
 * overdue chip turns red) carry into the icon without a second palette here.
 */

const NS = "http://www.w3.org/2000/svg";

/** `<svg>` with a 16×16 viewBox, sized in px by the caller. */
function svgRoot(size: number) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  return svg;
}

/** One stroked child element; `attrs` is applied as-is. */
function shape(tag: string, attrs: Record<string, string>) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

/** Face of an *empty* due chip — the click target that opens the date picker. */
export function calendarIcon() {
  const svg = svgRoot(12);
  svg.append(
    shape("rect", {
      x: "2.2",
      y: "3.4",
      width: "11.6",
      height: "10.4",
      rx: "1.6",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.3",
    }),
    shape("path", {
      d: "M2.2 6.6h11.6M5.6 2v2.6M10.4 2v2.6",
      stroke: "currentColor",
      "stroke-width": "1.3",
      "stroke-linecap": "round",
    }),
  );
  return svg;
}

/**
 * The add button in every form. Same reason as closeIcon below: + is a maths
 * glyph and rides the same axis, so as text it sat low by the same 1.5px.
 */
/** The plus, as numbers. Shared with react/icons.tsx -- see CLOSE. */
export const PLUS = {
  size: 12,
  d: "M8 3.5v9M3.5 8h9",
  strokeWidth: 1.5,
};

export function plusIcon() {
  const svg = svgRoot(PLUS.size);
  svg.setAttribute("aria-hidden", "true");
  svg.append(
    shape("path", {
      d: PLUS.d,
      stroke: "currentColor",
      "stroke-width": String(PLUS.strokeWidth),
      "stroke-linecap": "round",
    }),
  );
  return svg;
}

/**
 * The cross: the delete mark on a task row, and the memo panel's close button.
 *
 * Drawn rather than typed. As the × character it sat 1.36px below the middle of
 * its button, because that glyph centres on the font's maths axis and not on
 * its box — invisible until hover paints a square behind it, and then plainly
 * off. The fix was a padding tuned by measurement, which is a number that
 * quietly stops being right the moment the font or the size changes. Two lines
 * crossing at the centre of the viewBox are centred by construction.
 *
 * Kept as numbers because react/icons.tsx draws the same cross. While a
 * hand-built and a rendered version of this app both exist, one geometry has to
 * serve both or the two crosses drift apart.
 */
export const CLOSE = {
  size: 10,
  d: "M4.5 4.5l7 7M11.5 4.5l-7 7",
  strokeWidth: 1.5,
};

export function closeIcon() {
  const svg = svgRoot(CLOSE.size);
  svg.setAttribute("aria-hidden", "true");
  svg.append(
    shape("path", {
      d: CLOSE.d,
      stroke: "currentColor",
      "stroke-width": String(CLOSE.strokeWidth),
      "stroke-linecap": "round",
    }),
  );
  return svg;
}

/** The "this task has a memo" marker, on matrix rows and archive rows alike. */
/** The page, as numbers. Shared with react/icons.tsx -- see CLOSE. */
export const NOTE = {
  size: 11,
  page: "M3.4 2.2h9.2v11.6H3.4z",
  lines: "M5.6 5.4h4.8M5.6 8h4.8M5.6 10.6h3",
  strokeWidth: 1.3,
};

export function noteIcon() {
  const svg = svgRoot(NOTE.size);
  svg.setAttribute("aria-hidden", "true");
  svg.append(
    shape("path", {
      d: NOTE.page,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": String(NOTE.strokeWidth),
      "stroke-linejoin": "round",
    }),
    shape("path", {
      d: NOTE.lines,
      stroke: "currentColor",
      "stroke-width": String(NOTE.strokeWidth),
      "stroke-linecap": "round",
    }),
  );
  return svg;
}

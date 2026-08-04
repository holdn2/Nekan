/**
 * The two inline SVG icons. They are built in JS rather than dropped into
 * index.html because both ride on elements the renderer creates per task.
 *
 * Both stroke with `currentColor`, so the theme and the row's own state (an
 * overdue chip turns red) carry into the icon without a second palette here.
 */

const NS = "http://www.w3.org/2000/svg";

/** `<svg>` with a 16×16 viewBox, sized in px by the caller. */
function svgRoot(size) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  return svg;
}

/** One stroked child element; `attrs` is applied as-is. */
function shape(tag, attrs) {
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

/** The "this task has a memo" marker, on matrix rows and archive rows alike. */
export function noteIcon() {
  const svg = svgRoot(11);
  svg.setAttribute("aria-hidden", "true");
  svg.append(
    shape("path", {
      d: "M3.4 2.2h9.2v11.6H3.4z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.3",
      "stroke-linejoin": "round",
    }),
    shape("path", {
      d: "M5.6 5.4h4.8M5.6 8h4.8M5.6 10.6h3",
      stroke: "currentColor",
      "stroke-width": "1.3",
      "stroke-linecap": "round",
    }),
  );
  return svg;
}

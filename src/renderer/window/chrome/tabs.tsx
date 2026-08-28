/**
 * The tab strip, and the two lines in the guide that report on the app itself.
 *
 * The update line and the version both read pushed values, so they subscribe
 * like everything else rather than being written once and relabelled.
 *
 * Which section is on screen is this component's too. The four <section>s and
 * the dump are index.html's -- they hold the whole app, and one of them is the
 * guide, which is markup rather than components -- so they are shown and
 * hidden rather than rendered. Doing it here, from the same answer the buttons
 * above are drawn from, is what makes "the tab says one thing and the screen
 * shows another" impossible instead of remembered.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CircleHelp,
  Clock,
  Grid2x2,
  Info,
  type LucideIcon,
  Trash2,
} from "lucide-react";

import { Button } from "../../components/ui/button.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip.js";
import { cn } from "../../react/cn.js";
import { t } from "../../i18n.js";
import { $ } from "../../dom.js";
import { useRenderSignal } from "../../react/use-store.js";
import {
  UPDATE_TEXT,
  currentUpdate,
  currentVersion,
  getTab,
  setTab,
} from "./state.js";

/** The sections a tab shows, in the order they sit in index.html. */
const VIEWS: Record<string, string> = {
  matrix: "#matrixView",
  history: "#historyView",
  trash: "#trashView",
  guide: "#guideView",
};

/**
 * One icon per tab, added 2026-08-26. No hand-drawn icon existed here to
 * match, so the stroke is picked to sit in the same optical-weight family as
 * the rest of the chrome rather than derived from a prior value: target
 * effective stroke ~1.0px (react/icons.tsx's family runs 0.9-1.1px at its
 * sizes), so strokeWidth = 1.0 * 24/14 = 1.71, rounded to 1.75.
 */
const TAB_ICONS: Record<string, LucideIcon> = {
  matrix: Grid2x2,
  history: Clock,
  trash: Trash2,
  guide: CircleHelp,
};

/**
 * Where an icon's strokes actually begin, in viewport coordinates.
 *
 * getBBox reports the geometry in viewBox units and leaves the stroke out of
 * it, so half a stroke has to come back off the front -- Lucide centres its
 * strokes on the path. Falls back to the element box if the icon is not
 * rendered, which is what getBBox complains about.
 */
function inkLeft(icon: SVGElement): number {
  const box = icon.getBoundingClientRect();
  try {
    const view = (icon as SVGSVGElement).viewBox?.baseVal;
    const bbox = (icon as SVGGraphicsElement).getBBox();
    const scale = box.width / (view?.width || 24);
    const stroke = Number.parseFloat(icon.getAttribute("stroke-width") ?? "0");
    return box.left + (bbox.x - stroke / 2) * scale;
  } catch {
    return box.left;
  }
}

/** How far the rule runs past the tab's content, per side. */
const RULE_OVERHANG = 8;

function Tabs() {
  useRenderSignal();

  // A rule per tab could only fade in and out; one rule that moves is the whole
  // point, and where it moves to has to be measured -- the four tabs are
  // different widths, so the `:has()` trick the two-way switch uses cannot
  // work here.
  const rule = useRef<HTMLSpanElement>(null);
  const settled = useRef(false);
  useLayoutEffect(() => {
    const bar = rule.current;
    const active = bar?.parentElement?.querySelector<HTMLElement>(
      `[data-tab="${getTab()}"]`,
    );
    if (!bar || !active) return;
    const strip = bar.parentElement;
    const label = active.querySelector<HTMLElement>("[data-label]");
    const icon = active.querySelector<SVGElement>("svg");
    if (!strip || !label) return;
    // Bar mode hides the strip, so everything measures zero. Writing that in
    // would collapse the rule and then animate it back out on the way home.
    if (!active.offsetWidth) return;

    // Every number below is a viewport coordinate, and that is the point.
    // Mixing offsetLeft with a transform counts the strip's own padding twice:
    // offsetLeft is measured from its border box, while `left: 0` on an
    // absolutely positioned child resolves against its padding box. The strip
    // carries px-xl, so the rule sat exactly 12px right of where it belonged --
    // on every tab, which is what made it look deliberate rather than broken.
    const stripBox = strip.getBoundingClientRect();
    const origin =
      stripBox.left +
      (Number.parseFloat(getComputedStyle(strip).paddingLeft) || 0);
    // From where the icon's strokes start to where the label's glyphs end.
    //
    // The icon's element box is not where its ink is: Lucide draws inside a 24
    // unit viewBox with room to spare, so at 14px the strokes begin 1.2 to
    // 1.8px inside the box, and it differs per icon. Measuring the box instead
    // left the rule that much longer on its left than its right -- under 2px,
    // and visible. Text has no such inset: its box and its glyphs measured
    // identical on every tab, so the right edge can stay the label's box.
    const to = label.getBoundingClientRect().right;
    const from = icon ? inkLeft(icon) : label.getBoundingClientRect().left;
    // The first placement must not travel: the saved tab arrives after an IPC
    // round trip, so a transition here would slide the rule in from the left
    // every time the app opens -- the same reason body.booting exists for the
    // switch pill. Reading offsetWidth between the two writes is what keeps
    // them from being collapsed into one style recalculation.
    if (!settled.current) bar.style.transition = "none";
    bar.style.width = `${to - from + RULE_OVERHANG * 2}px`;
    bar.style.transform = `translateX(${from - origin - RULE_OVERHANG}px)`;
    if (!settled.current) {
      void bar.offsetWidth;
      bar.style.transition = "";
      settled.current = true;
    }
  });

  // Every render, not once: the effect is how the sections learn, so it has to
  // run whenever the answer it reads can have changed.
  useEffect(() => {
    const tab = getTab();
    for (const [name, selector] of Object.entries(VIEWS))
      $(selector).classList.toggle("hidden", tab !== name);
    // The dump belongs to the matrix and leaves with it.
    $("#inboxPanel").classList.toggle("hidden", tab !== "matrix");
  });

  return (
    <>
      {/* Absolute against the strip, which carries `relative` in index.html.
          left-0 rather than a left offset: the position is a transform, so it
          animates on the compositor instead of relaying out the strip. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute bottom-[-1px] left-0 h-2xs w-[0px]",
          "bg-text transition-[transform,width] duration-[180ms] ease-out",
        )}
        ref={rule}
      />
      {["matrix", "history", "trash", "guide"].map((tab) => {
        const Icon = TAB_ICONS[tab];
        return (
          <button
            key={tab}
            className={cn(
              // `tab` is kept only because the active one is found by it in
              // tests and by anything looking in from outside; nothing styles it.
              // Underlined, following the `line` variant of the ported
              // components/ui/tabs.tsx: a 2px rule drawn by ::after and turned
              // on with opacity, sitting on the baseline the strip carries.
              // Taken over a filled pill because ink is weak as a fill and
              // strong as a rule -- the same property that made swapping the
              // accent colour almost invisible works in our favour here. It
              // also keeps the strip to one surface, which matters in dark
              // where panel and panel-2 are closer together than in light.
              // border-0 and bg-transparent are not decoration: there is no
              // Tailwind preflight here, so a bare <button> keeps the operating
              // system's own border and fill. Dropping them turned all four
              // tabs into outlined boxes.
              "tab relative flex items-center gap-sm border-0 bg-transparent",
              "px-xl py-md leading-none",
              getTab() === tab
                ? "font-medium text-text"
                : "text-muted hover:text-text",
            )}
            type="button"
            data-tab={tab}
            onClick={() => setTab(tab)}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            {/* Still wrapped rather than a bare text node: the rule under the
                tab is measured to the end of this element. */}
            <span data-label>{t(`tabs.${tab}`)}</span>
          </button>
        );
      })}
      <ScreenHelp />
    </>
  );
}

/**
 * The two sentences this screen used to say out loud, behind a button.
 *
 * They were removed (PR #61) because they sat there permanently and the guide
 * tab says the same thing -- but for somebody on their first day they were
 * worth having at the place they describe. This is the form that costs no
 * room: one control at the end of the strip, and nothing on screen until it is
 * asked.
 *
 * ONE BUTTON, NOT TWO. The sentences belonged to two different places (the tab
 * strip and the brain dump's header). Putting one back in each would spend the
 * complexity that removing them bought. They are short enough to read together.
 *
 * HOVER AND CLICK, WHICH IS NOT WHAT A TOOLTIP DOES. Radix opens this on hover
 * and on keyboard focus, and closes it on a press -- fine for a mouse, useless
 * for anyone who wants it to stay while they read. `stuck` is the click half:
 * it holds the tooltip open independently of the pointer, and Escape or a
 * press outside lets it go. That is a popover's behaviour wearing a tooltip's
 * clothes, and it is deliberate -- the alternative is two ways to open one
 * sentence.
 *
 * The letter i is drawn, not typed: a glyph in a 20px control sits on the
 * font's own baseline rather than in the middle of the box.
 */
function ScreenHelp() {
  // The words come from the catalogue, so a language change has to redraw it.
  useRenderSignal();
  const [hovered, setHovered] = useState(false);
  const [stuck, setStuck] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={hovered || stuck} onOpenChange={setHovered}>
        <TooltipTrigger asChild>
          <Button
            className={cn(
              // Beside the tabs rather than exiled to the far end. At the far
              // right it read as belonging to the window rather than to the
              // strip, and there was nothing between it and the tabs to say
              // what it was about. `ml-md` is one step wider than the gap
              // between two tabs, which is enough to say it is not a fifth
              // one.
              "ml-md text-faint hover:text-text",
            )}
            variant="ghost"
            size="icon-sm"
            type="button"
            title={t("tabs.help")}
            aria-label={t("tabs.help")}
            onClick={() => setStuck((open) => !open)}
          >
            {/* 16px against the tabs' 14: this one has no label beside it,
                so it carries the whole control on its own. */}
            <Info size={16} strokeWidth={1.6} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          align="end"
          className="max-w-[280px] leading-relaxed"
          side="bottom"
          sideOffset={6}
          onEscapeKeyDown={() => setStuck(false)}
          onPointerDownOutside={() => setStuck(false)}
        >
          <p className="m-[0px]">{t("tabs.helpTasks")}</p>
          <p className="m-[0px] mt-xs">{t("tabs.helpDump")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The line in the guide tab that says where the update is up to. */
function UpdateLine() {
  useRenderSignal();
  const key = UPDATE_TEXT[currentUpdate()?.state ?? ""];
  const update = currentUpdate();
  const shown = update?.version ? ` ${update.version}` : "";
  return <>{key ? t(key, { version: shown }) : ""}</>;
}

/** The version in the guide tab, beside that line. */
function GuideVersion() {
  useRenderSignal();
  return <>{currentVersion() || "—"}</>;
}

export { Tabs, UpdateLine, GuideVersion };

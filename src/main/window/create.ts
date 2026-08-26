/**
 * Building the window, and the one decision that can only be made here.
 *
 * A quit from bar mode has to come back as the bar. The window is built at the
 * expanded bounds and the renderer has already been answered by then, so a
 * renderer asking to expand is asking about a bar nobody ever told it about --
 * ready-to-show is the only place that knows.
 */

import path from "node:path";
import { BrowserWindow } from "electron";
import { SUPPORTED } from "../../shared/i18n/locales";
import { PALETTE } from "../../shared/theme";
import { getSettings } from "../store";
import { collapse } from "./fold";
import {
  EXPANDED,
  SRC,
  endSwitch,
  getWindow,
  rememberPlacement,
  sanitizeBounds,
  savedBarPosition,
  setWindow,
} from "./state";

/** Build the window from the saved settings and show it once it can paint. */
function createWindow() {
  const settings = getSettings();
  const saved = sanitizeBounds(settings.bounds);

  const w = new BrowserWindow({
    width: saved ? saved.width : EXPANDED.width,
    height: saved ? saved.height : EXPANDED.height,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: EXPANDED.minWidth,
    minHeight: EXPANDED.minHeight,
    frame: false,
    show: false,
    // What shows between the window appearing and the renderer's first paint,
    // and what a resize exposes. Read from the palette rather than repeated
    // here: these were the previous theme's two values, still sitting in the
    // main process after the colours moved, so the window opened cream and
    // then turned grey.
    backgroundColor: PALETTE[settings.theme === "dark" ? "dark" : "light"].bg,
    icon: path.join(SRC, "assets", "icon.ico"),
    alwaysOnTop: settings.alwaysOnTop !== false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(SRC, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // The language, handed over before the window exists. It cannot come
      // through state:load: that is an IPC round trip and lands after the first
      // paint, so the window would show one language for a frame and then swap.
      // preload reads this out of argv synchronously, which is early enough.
      additionalArguments: [
        `--nekan-lang=${settings.language || ""}`,
        `--nekan-langs=${SUPPORTED.join(",")}`,
      ],
    },
  });
  setWindow(w);

  w.loadFile(path.join(SRC, "renderer", "index.html"));

  w.once("ready-to-show", () => {
    // The window may have been closed between building it and being able to
    // paint it; `w` is still here, the app's window is not.
    if (!getWindow()) return;
    w.show();
    // Quitting from bar mode has to come back as the bar, where it was left —
    // the window was just built at the expanded bounds, which is somewhere else.
    //
    // Unless the first-run question is still open, which collapse() refuses.
    // That screen needs the whole window, and only main can give it to it: the
    // renderer's state:load has already been answered by the time this runs, so
    // a renderer asking to expand is asking about a bar nobody told it about.
    // Anyone upgrading who left the app as a bar arrives here.
    if (settings.mode !== "collapsed" || !collapse(savedBarPosition())) {
      endSwitch();
    }
  });

  w.on("resize", rememberPlacement);
  w.on("move", rememberPlacement);

  w.on("closed", () => {
    setWindow(null);
  });

  return w;
}

export { createWindow };

/**
 * Every `ipcMain.handle` in the app, grouped by what it is for.
 *
 * Adding a channel means touching three files and this folder is the first:
 * the handler here, the bridge in preload.ts, and the `window.api.*` call in
 * the renderer. Miss one and the call fails silently at runtime.
 *
 * Handlers stay thin on purpose. Each one validates what came over the wire,
 * calls into store/window/export, and returns the value the renderer needs --
 * the logic lives in those modules, not here.
 */

import { registerStateIpc } from "./ipc/state";
import { registerWindowIpc } from "./ipc/window";
import { registerSettingsIpc } from "./ipc/settings";
import { registerShellIpc } from "./ipc/shell";
import { registerAuthIpc } from "./ipc/auth";

/** Bind every channel. Called once, before the window is created. */
function registerIpc() {
  registerStateIpc();
  registerWindowIpc();
  registerSettingsIpc();
  registerShellIpc();
  registerAuthIpc();
}

export { registerIpc };

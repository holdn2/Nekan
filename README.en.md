# Nekan

An Eisenhower matrix desktop widget. Built on Electron, for Windows.
Ships with a warm Claude-style light theme and a dark one.

The name comes from the four boxes (_ne_ = four, _kan_ = box). It is spelled `Nekan` everywhere, in the app and out of it.

> 한국어 문서는 [README.md](README.md)에 있습니다.

## Install

Grab the latest `Nekan-Setup-x.y.z.exe` from [Releases](https://github.com/holdn2/Nekan/releases) and run it.
One click and it is done, and it **never asks for administrator rights** — it installs into your own user folder.
When it finishes you get a **Nekan** shortcut on the desktop and in the Start menu.

> The build is not code-signed yet, so Windows SmartScreen puts up a "Windows protected your PC" warning.
> **More info → Run anyway** installs it.

## Updates

**There is nothing to do.** While the app is open it checks for a new version and downloads it in the background.
A downloaded version **is applied when you close the app**, so the next time you launch it you are already up to date.

It checks at three moments: **just after launch**, **when you come back to the app or the computer wakes from sleep**,
and, regardless of those, **every six hours**. The middle one is there so an app left running for days does not
learn about a new version late; to avoid asking too often, checks are at least 30 minutes apart.

If you would rather not wait, the **↑** button that appears in the title bar (or **Restart now** in the notification
that comes with it) restarts and applies it there and then. **That button only appears once a version has been
downloaded** — if you cannot see it, you are either already up to date or it is still downloading. A failed check
(no network, say) shows nothing at all.

Your tasks live in `%APPDATA%\Nekan`, not in the install folder, so an update leaves them alone.

**The running version is written beside the app name in the title bar**, in small text (it drops out of bar mode
along with the name, so it costs the bar no width).

**At the bottom of the [Guide tab](#guide-tab)** you get the version, the update state (`This is the latest version` ·
`Downloading the new version…` · `ready`) and a link to the release notes. When a check **fails it says nothing at
all** — claiming "you are up to date" after failing to check would be the worst lie available.

## The first launch

**On the first run the app asks where your tasks should live.**

- **Sign in with Google and sync** — the same list on every device
- **Keep them on this computer** — start right away, no account

It only asks once, and **you can change your mind later in the settings.** If you already have tasks, the same
screen asks whether those should be merged into the account too.

## Settings (⚙)

The **gear** in the title bar collects them in one place.

|                         |                                                    |
| ----------------------- | -------------------------------------------------- |
| **Language**            | 한국어 ↔ English (applied the moment you pick one) |
| **Theme**               | Light ↔ Dark (`Ctrl` + `D` does it too)            |
| **Export**              | PDF · HTML · Markdown (`Ctrl` + `E` does it too)   |
| **Sync across devices** | Sign in · sign out · current state                 |

Pressing it in bar mode expands the window first.

**The language follows your computer on the first launch** — Korean in a Korean environment, English everywhere
else. Once you pick one it is remembered, and a later change to the computer's language does not override it.
Switching takes effect on the spot, with no restart, and exported documents come out in the language you picked.

## Sync across devices

**Sign in and every device shows the same list.** Use **Sync across devices** in [Settings (⚙)](#settings-) to sign
in with Google. The sign-in page opens in **your usual browser**, not inside the app.

After that there is nothing to think about. What you change goes up a few seconds later, and what you changed
elsewhere comes down on its own.

**The app works as usual with no internet.** Its job is to catch a thought the moment you have it, so a dropped
connection must not block typing. Changes stay on this computer and go up when you are back online.

**A dot on the gear means something has not gone up yet.** It is visible in bar mode too.

| Gear      | Meaning                                                     |
| --------- | ----------------------------------------------------------- |
| No dot    | Everything is up, or you are not signed in                  |
| Amber dot | Some changes are still only on this computer                |
| Red dot   | The server could not be reached. Your changes are safe here |

**Open the settings** for the exact number (`Synced` · `N waiting` · `Offline`).

**Edit the same task on two devices at nearly the same time and the later edit wins.** If that overwrites an edit
of yours that had not gone up yet, **the app tells you it did** — nothing disappears quietly.

**Signing out does not delete the tasks on this computer.** Neither does the server going down.

**To delete the account itself, use `Delete account` in the settings.** The copy on the server and the syncing with
your other devices both go away, and **it cannot be undone.** The **tasks on this computer stay**, so you can go on
using the app without an account. Pressing it does not delete anything immediately: it shows you what will happen
and asks again.

If you sign in for the first time with tasks already on this computer, **the app asks whether to merge those into
the account.** Decline and nothing is deleted — they are moved to `%APPDATA%\Nekan\data.before-login.json`. That
option exists so a quick sign-in on somebody else's computer does not push their tasks into your account.

## Running it (development)

```powershell
npm install   # once
npm start
npm test      # unit tests for storage, normalisation and dates (optional)
```

**Building the installer**

```powershell
npm run dist      # dist\Nekan-Setup-1.0.0.exe -- local check, not uploaded
npm run release   # build + upload to a GitHub Release (see GH_TOKEN below)
```

**Release procedure**

1. Bump `version` in `package.json` and commit it.
2. `npm run release` — electron-builder builds the installer and `latest.yml` and uploads them to a **draft**
   Release for that version.
3. **Publish** that Release on GitHub. Installed apps start seeing the new version from that moment.

`latest.yml` is the update feed. Upload the installer on its own and nobody updates.

> **electron-builder makes two drafts for the same tag.** The uploads run in parallel, both decide "there is no
> release yet" and each creates one — a race, and it split that way on **both** v1.0.0 and v1.0.1 (the `.blockmap`
> came away on its own each time). So `npm run release` finishes by running `tools/check-release.js`, which
> **merges them automatically and checks all three files are there.** There is nothing to do by hand; if something
> is missing it tells you through the exit code.
>
> Publishing a split draft breaks quietly: publish the half without `latest.yml` and nobody updates at all, publish
> the half without `.blockmap` and everybody downloads the full 100MB every time.

## Features

### Work / Life matrices

The **`Work` / `Life` toggle** in the title bar gives you two matrices instead of one. It exists so work stops
being in front of you after hours, and so personal things do not creep in during the day.

- **The quadrants, the history, the trash, the count chips and the export all show only the side you picked.** The toggle is a mode for the whole app, not just the matrix.
- **There is exactly one exception, the [Brain dump](#brain-dump-the-list-above-the-matrix).** Both sides share that list, which is why its header is marked `Shared`.
- **Which side a task belongs to is decided when it goes down into a quadrant.** While it sits in the brain dump it is neither Work nor Life; drag it into the matrix you are looking at and it joins that one.
- The reverse also holds: **drag a task from a quadrant up into the brain dump and it leaves its side.** So lifting a work task up and pulling it back down on the Life side **moves it across.**
- The side you picked survives a restart, and **the toggle stays visible in bar mode.**
- Both matrices are **saved in one file** (each task carries its side). There is no extra file to back up.

### Window modes

| Button | What it does                                                     |
| ------ | ---------------------------------------------------------------- |
| ⚙      | **Settings** — theme · export · sync. See [Settings](#settings-) |
| 📌     | Always on top, on/off                                            |
| ▭      | **Bar mode ↔ expanded mode** (a 640×48 bar ↔ the full UI)        |
| —      | Minimise to the taskbar                                          |
| ✕      | Quit the app                                                     |

- Drag the title bar to move the window, and **double-click** it to toggle bar mode.
- Bar mode keeps the **icon, the `Work`/`Life` toggle, the per-quadrant counts and the window buttons**. Clicking a count chip expands the window again, and the toggle still works while collapsed (the counts recount for the side you picked).
- The only things that drop out of the bar are **the app name and the version beside it**. Moving theme and export into the settings gave the bar a button back. The bar is **640×48**; the toggle pushed the window buttons off the old 440px, and the update button widened it once more (`Ctrl` + `E` only works in expanded mode).
- **It expands from wherever you left the bar.** A bar parked against the right edge of the screen opens leftwards from that edge, so it never goes off-screen, and collapsing that window puts the bar back where it was.
- Window position, size, mode, theme and the always-on-top state all survive a restart. **Quit in bar mode and the next launch opens as a bar, in the same place.**

### Brain dump (the list above the matrix)

Somewhere to pour out everything in your head before sorting any of it. It sits directly above the matrix.

**It is the only list the Work and Life matrices share** (hence the `Shared` mark in its header). You do not have to
decide which side something belongs to while you are writing it down; it joins a side later, when you drag it into a
quadrant.

- **Click `Brain dump`** in the header to unfold it, click again to fold. The state survives a restart.
- Type in the box and press Enter — the box clears, so **you can keep going**.
- **Paste several lines** from a notes app or a chat and each line becomes its own task. Leading list markers (`-`, `*`, `1.`) and blank lines are stripped for you (up to 100 lines at a time).
- **Drag an item down into a quadrant** to sort it. You can **drag one back up** as well (drop it on the header if the list is folded), and reorder within the list.
- **Double-click to edit** an item, `×` sends it to the trash.
- **A long list never pushes the matrix off-screen.** It grows to a set height and scrolls inside itself after that.
- Due dates, notes and the completion tick are available **once a task is down in a quadrant**. At this stage all you need to write is the text.
- If anything is still unsorted, **a count chip appears even in bar mode** (a hollow circle). It disappears when the list is empty.

### Matrix tab

- Four quadrants: **Urgent & Important / Important & Not Urgent / Urgent & Not Important / neither**
- Type in the box under a quadrant and press Enter, or press `+`
- Each row is numbered **within its quadrant** (drag to reorder and the numbers follow)
- Hover a row and `×` deletes it → **it goes to the trash**
- **Click the circle on the left to complete** a task: it leaves the list and lands in the history
- **Double-click a task to edit** it (Enter saves, Esc cancels)
- **Click a task to open its note** (see [Notes](#notes))
- **Drag a task into another quadrant**, or reorder it within one
- **The count turns red once quadrant 1 holds more than five.** It means you are chasing whatever is loudest, and it is usually the result of putting quadrant 2 off (see the [Guide tab](#guide-tab)). **It does not stop you** — refusing to let somebody write a task down just puts it back in their head. No other quadrant has this mark. A full quadrant 2 is a sign you are doing well.

### Resizing the quadrants

- There are no splitter bars: **drag the edge between quadrants** directly.
- The four quadrants share the horizontal and vertical lines: widening quadrant 1 narrows quadrant 2, and 3 and 4 move with them; making quadrant 1 taller makes 3 and 4 shorter.
- Grab the **crossing point** in the middle to adjust both at once.
- **Double-click** an edge to reset it to even halves. The proportions survive a restart.

### Due dates

- The **calendar button** beside the input sets a due date as you add the task.
- For a task that already exists, **click the date chip** on the right to open the calendar, and the `×` beside it clears the date.
- The colour follows how far away it is: **overdue** (red) / **today** (orange) / **within three days** (yellow) / later (grey).
- Leave the app running for days and **the colour and the day count refresh themselves at midnight.**
- Due dates show up in the history and trash lists too.

### Notes

- **Click a task** and a note panel opens under the matrix. One note per task.
- **The quadrants keep their size** when it opens. Rather than squeezing the matrix, the window grows by the height of the panel and shrinks back when it closes. (If there is no room on screen, it grows by as much as there is.)
- A task with no note opens straight into editing. `Ctrl` + `Enter` saves, `Esc` cancels.
- **Double-click** a saved note to edit it again; `Delete` removes the note only, leaving the task.
- A task with a note gets a **note icon**, and hovering it previews the text.
- In the history and trash the note is shown under the task, **read-only**. A long one is clipped to three lines and **clicking expands it** (click again to collapse). Notes cannot be edited or removed from these two tabs, and restoring from the trash brings the note back with the task.
- Clicking the task again, pressing `✕`, switching tabs or collapsing to the bar closes the panel and gives the window its height back.
- Notes hold up to 2000 characters and are saved in `data.json` alongside the tasks.

### Export

Saves the **brain dump plus the four quadrants** exactly as they are on screen. Handy for pasting into a meeting
document or printing to stick on a wall.

**Only the side you have selected** goes out. The document title and the suggested filename say which one
(`Nekan Work 2026-08-02.pdf`), and the brain dump, being shared, appears in both documents. If you need both, flip
the toggle and export again.

- **Export in Settings (⚙)** or `Ctrl` + `E` → a save dialog opens.
- Pick the **file type** at the bottom of that dialog:
  - **PDF** — one A4 page, landscape. For printing and sharing (the default)
  - **HTML** — a single file that opens in a browser. It references nothing external, so you can send it as-is
  - **Markdown** — text to paste into Notion, GitHub or a notes app
- The document carries **quadrant titles, numbering, tasks, due dates (with the days remaining) and notes** — the list as it stands. An empty quadrant is marked `Empty` so the 2×2 layout is preserved.
- **Completed and trashed tasks are not included.** Only what is live right now.
- A notification appears when it is saved, and `Open the folder` takes you straight there.
- PDFs always use the **light palette** (printing the dark theme would give you a black rectangle).
- With no tasks at all it saves nothing and just says so. The button is hidden in bar mode.

### History tab

- **Only the matrix you have selected** (Work or Life). The count badge beside the tab follows it too
- Completed tasks grouped by date, newest first (with the completion time and the colour of the quadrant they came from)
- Numbering restarts at 1 inside each date group
- The search box filters. **Search always goes through the whole history** — not just what is drawn — so something completed long ago comes straight back
- **Only 100 rows are drawn at a time; beyond that, `Show more (N left)` appears at the end of the list.** It is there so typing in the search box does not stutter on a long history, and **nothing is being deleted.** Leaving the tab and coming back, or changing the search, starts again from 100
- `Restore` → back to its original quadrant / `Delete` → to the trash
- `Move all to the trash` → every completed task at once

### Trash tab

- A deleted task is not gone: it waits in the trash and **can be brought back**.
- Like the history, **only the selected matrix** is shown. A task deleted straight from the brain dump has no side, though, so it appears in **both** trashes. `Empty the trash` also only removes what is on screen.
- Grouped by the date it was deleted, newest first, with the same search box. As in the history, 100 rows are drawn and the rest follow behind `Show more`.
- `Restore` → back where it was (to the history if it had been completed) / `Delete forever` → gone for good
- `Restore all` / `Empty the trash` handle everything at once (emptying cannot be undone)
- A task deleted forever never appears anywhere in the app again, but **a marker that it was deleted stays in the file for 90 days.** That is what stops a deleted task coming back to life once several devices share a list; the text and the note are erased immediately.

### Guide tab

- An explanation of the Eisenhower matrix framework (the two axes, what each quadrant means, with examples)
- How to use it, principles worth remembering, and tips that connect it to what this app does — a read-only document
- **The running version and the update state** are at the bottom, with a link to the release notes (it opens in your default browser)
- The text lives in `src/shared/i18n/{ko,en}.json` under `guide.*`; `#guideView` in `src/renderer/index.html` is the shape it goes into

### Keyboard shortcuts

| Key              | What it does                              |
| ---------------- | ----------------------------------------- |
| `Ctrl` + `M`     | Bar mode ↔ expanded mode                  |
| `Ctrl` + `D`     | Light ↔ dark theme                        |
| `Ctrl` + `E`     | Export (PDF · HTML · Markdown)            |
| `Ctrl` + `0`     | Unfold the brain dump and focus its input |
| `Ctrl` + `1~4`   | Focus that quadrant's input               |
| `Enter`          | Add a task / save an edit                 |
| `Ctrl` + `Enter` | Save a note                               |
| `Esc`            | Cancel an edit / cancel a note edit       |

## The icon

`build\icon.ico` (multi-size, 16–256px) is used for the exe, the taskbar and the title-bar logo alike.
To change the design, edit the colours and regenerate it.

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-icon.ps1
```

## Where the data lives

```
%APPDATA%\Nekan\data.json
```

If there is data in a folder from before the rename (`EisenhowerMatrix`, and `eisenhower-matrix` before that),
**the first launch copies it across once.** The old folder is left alone, so you can check it and delete it yourself.

Tasks (with their due dates and notes), the completion history, the trash and the window and theme settings are all
saved as JSON in this one file. **The Work and Life matrices are not split into separate files either** — each task
carries its side (brain-dump tasks carry none), and the settings only record which one you are looking at.
Saving writes a temporary file and renames it, so an interruption cannot corrupt the file.
To back it up, copy this file.

Your sign-in **is not in that file.** It is kept separately in `%APPDATA%\Nekan\auth.json`, encrypted by the OS, so
copying `data.json` does not carry your account with it.

## Layout

```
build/icon.ico         # exe / taskbar icon
tools/make-icon.ps1    # icon generator
tools/seed-dev-data.js # bulk dummy data (for performance checks)
tools/check-release.js # inspects and repairs release drafts (called by the release script)
tools/find-untranslated.js # counts the Korean still baked into the source
src/
  main.js              # app lifecycle and assembly
  preload.js           # the contextBridge IPC bridge
  assets/icon.*        # icon copies used at runtime
  main/
    store.js           # in-memory copy of data.json + debounced saving
    window.js          # window creation, expanded/bar modes, note-panel height
    export-service.js  # writing PDF / HTML / MD
    updater.js         # checking GitHub Releases · background downloads
    api-client.js      # the one place that talks to Supabase
    token-store.js     # the session, encrypted into auth.json
    sync.js            # the pull / push / retry loop
    oauth.js           # the browser side of Google sign-in (PKCE + loopback)
    i18n.js            # strings for the main process
    ipc.js             # every ipcMain handler
  shared/
    core.js            # dates, normalisation, layout ratios, Work/Life rules (main, renderer and tests)
    store-io.js        # reading and writing data.json (temp write + rename)
    export.js          # building the export documents (Markdown / print HTML → PDF)
    sync.js            # sync decisions (last-write-wins, row mapping, cursors, clock skew)
    auth.js            # session shape and expiry
    i18n/              # ko.json · en.json · GLOSSARY.md · locales.js
  renderer/            # ES modules (no bundler)
    index.html
    app.js             # entry point: render dispatcher, shortcuts, init
    store.js           # the task array and every change to it (knows nothing of the DOM)
    render-bus.js      # the one "redraw" signal
    core-bridge.js     # shared/core.js as named exports
    i18n.js            # strings for the renderer
    dom.js             # shared DOM helpers
    components/        # icons, due chip, note marker, toast
    views/             # quadrants · brain dump · history/trash · note panel · account · settings · first run
    window/            # title bar and tabs · quadrant edges · drag and drop · export
    styles/            # 15 files by area (light/dark palettes in base.css, the shared toggle in switch.css)
test/                  # node --test unit tests
```

# Nekan

An Eisenhower matrix desktop widget. Built on Electron, for Windows and macOS.
Ships with a warm Claude-style light theme and a dark one.

The name comes from the four boxes (_ne_ = four, _kan_ = box). It is spelled `Nekan` everywhere, in the app and out of it.

The website is **[holdn2.github.io/Nekan](https://holdn2.github.io/Nekan/)** — the
[privacy policy](https://holdn2.github.io/Nekan/privacy/en/) and the way to
[request account and data deletion](https://holdn2.github.io/Nekan/delete-request/en/) live there.

> 한국어 문서는 [README.md](README.md)에 있습니다.

## Install

Everything is on [Releases](https://github.com/holdn2/Nekan/releases). (`x.y.z` - version)

**Windows** — grab `Nekan-Setup-x.y.z.exe` and run it.
One click and it is done, and it **never asks for administrator rights** — it installs into your own user folder.
When it finishes you get a **Nekan** shortcut on the desktop and in the Start menu.

> The build is not code-signed yet, so Windows SmartScreen puts up a "Windows protected your PC" warning.
> **More info → Run anyway** installs it.

**macOS** — grab the `.dmg` for your chip.

| Mac                               | File                    |
| --------------------------------- | ----------------------- |
| Apple Silicon (M1 · M2 · M3 · M4) | `Nekan-x.y.z-arm64.dmg` |
| Intel                             | `Nekan-x.y.z-x64.dmg`   |

Apple menu → About This Mac tells you which: `Chip` means Apple Silicon,
`Processor` with Intel in it means Intel. Open the `.dmg` and drag Nekan into
**Applications**.

> The `.zip` beside it is what the app uses to update itself, so there is no
> need to download it.
>
> **On macOS the modifier is `Cmd`, not `Ctrl`.** Read every `Ctrl` in this
> document as `Cmd`; the guide tab says the right word for the OS it runs on.

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

On macOS read every `Ctrl` in this document as `Cmd` -- the app uses whichever
modifier that OS means. The guide tab is different: **wherever a shortcut
appears it names both, as `Ctrl / Cmd`**, because the guide is read as often to
check what something is on your other machine as to be used on this one. The
hints elsewhere in the app -- the export line in the settings panel -- name only
the modifier you have.

**The language follows your computer on the first launch** — Korean in a Korean environment, English everywhere
else. Once you pick one it is remembered, and a later change to the computer's language does not override it.
Switching takes effect on the spot, with no restart, and exported documents come out in the language you picked.

## Sync across devices

**Sign in and every device shows the same list.** A Google account is all it takes, and the sign-in page opens in
**your usual browser** rather than inside the app (where to press for it is in the [Guide tab](#guide-tab)).

After that there is nothing to think about. What you change goes up a few seconds later, and what you changed
elsewhere comes down on its own.

**The app works as usual with no internet.** Its job is to catch a thought the moment you have it, so a dropped
connection must not block typing. Changes stay on this computer and go up when you are back online.

**A dot on the gear means something has not gone up yet.** It is visible in bar mode too.

| Gear       | Meaning                                                     |
| ---------- | ----------------------------------------------------------- |
| No dot     | Everything is up, or you are not signed in                  |
| Orange dot | Some changes are still only on this computer                |
| Red dot    | The server could not be reached. Your changes are safe here |

**Open the settings** for the exact number (`Synced` · `N waiting` · `Offline`).

**Edit the same task on two devices at nearly the same time and the later edit wins.** If that overwrites an edit
of yours that had not gone up yet, **the app tells you it did** — nothing disappears quietly.

**Signing out does not delete the tasks on this computer.** Neither does the server going down.

**To delete the account itself, use `Delete account` in the settings.** The copy on the server and the syncing with
your other devices both go away, and **it cannot be undone.** The **tasks on this computer stay**, so you can go on
using the app without an account. Pressing it does not delete anything immediately: it shows you what will happen
and asks again. If you have already uninstalled the app, you can
[ask from the web instead](https://holdn2.github.io/Nekan/delete-request/en/).

If you sign in for the first time with tasks already on this computer, **the app asks whether to merge those into
the account.** Decline and nothing is deleted — they are moved to `%APPDATA%\Nekan\data.before-login.json`. That
option exists so a quick sign-in on somebody else's computer does not push their tasks into your account.

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
all**.

## Running it (development)

```powershell
npm install   # once
npm start           # builds, then opens the app
npm test            # builds, then the unit tests (storage, normalisation, dates, sync)
npm run build       # compile src/ into out/ and nothing else
npm run build:watch # keep compiling while you edit
```

**Building the installer**

```powershell
npm run dist      # dist\Nekan-Setup-1.0.0.exe -- local check, not uploaded
npm run release   # build + upload to a GitHub Release (see GH_TOKEN below)
```

> **If it dies with `EBUSY ... unlink ...\dist\win-unpacked\resources\app.asar`,**
> build outside the repository. Something on this machine keeps handles on the
> `.asar` files under that path -- real-time scanning, most likely -- and the
> directory can be neither deleted nor renamed, while electron-builder empties
> `<output>/win-unpacked` before unpacking Electron into it. It is not one of
> ours: nothing runs there.
>
> ```powershell
> $env:NEKAN_DIST = "$env:LOCALAPPDATA\Temp\nekan-dist"
> npm run release
> ```
>
> `tools/dist.js` settles that and hands it to both electron-builder and
> `check-release.js`, because the two have to agree: the check re-uploads assets
> from disk when a draft splits, and can only find them where the build wrote
> them. **The mac workflow does not follow it** -- its artifact globs and its
> codesign step name `dist` literally, so moving `build.directories.output` means
> changing those too.

**Release procedure**

1. Bump `version` in `package.json` and commit it.
2. `npm run release` — electron-builder builds the installer and `latest.yml` and uploads them to a **draft**
   Release for that version.
3. **Publish** that Release on GitHub. Installed apps start seeing the new version from that moment.

`latest.yml` is the update feed. Upload the installer on its own and nobody updates.

**Step 2 above is the Windows half.** There is no Mac here, so the mac bundle is
built by the `Mac build` workflow on GitHub Actions, and one step goes between 2
and 3:

**2-1.** Actions → **Mac build** → Run workflow, branch `main`, **tick publish**.
It signs, notarises, checks the result (`codesign` · `stapler` · `spctl`) and
uploads the mac assets **into the same draft**: a `dmg`, a `zip` and two
blockmaps per architecture, plus one `latest-mac.yml`. `check-release.js` then
says whether both platforms are complete.

**The order matters.** That job never creates a release: if there is none it
says to run `npm run release` first, and stops. Letting it create one would put
two drafts on one tag, which is the single failure `check-release.js` cannot
repair, because the bytes are on another machine.

**Everything that can answer no is asked up front.** Ticking publish on a branch
other than `main`, or when there is no release for that version yet, fails in a
preflight job within seconds -- rather than after the half hour the build and
notarisation take, on a runner that bills at ten times the Linux rate.

**A pull-request build does not sign.** electron-builder refuses to
(`isSignAllowed()`), so a manual run is the only way to check that path. Run it
with publish unticked and it signs, notarises and leaves the result as an
artifact.

> **electron-builder makes two drafts for the same tag.** The uploads run in parallel, both decide "there is no
> release yet" and each creates one — a race, and it split that way on **both** v1.0.0 and v1.0.1 (the `.blockmap`
> came away on its own each time). So `npm run release` finishes by running `tools/check-release.js`, which
> **merges them automatically and checks all three files are there.** There is nothing to do by hand; if something
> is missing it tells you through the exit code.
>
> Publishing a split draft breaks quietly: publish the half without `latest.yml` and nobody updates at all, publish
> the half without `.blockmap` and everybody downloads the full 100MB every time.

## Features

**How to operate the app is in the [Guide tab](#guide-tab) inside it.** That tab is the source for
what to press and what happens; this section is about **what kind of app this is** and **why it was
built the way it was**.

### Work / Life matrices

The **`Work` / `Life` toggle** in the title bar gives you two matrices. It is there so the office does not follow you home, and so personal errands do not sit in the middle of a working day.

- **The quadrants, the history, the trash, the count chips and the export all show one side only.** The toggle is a mode for the whole app, not just for the matrix.
- **There is exactly one exception, the [Brain dump](#brain-dump-the-list-above-the-matrix).** Both sides share that list, which is why its header is marked `Shared`.
- **Which side a task belongs to is decided the moment it goes down into a quadrant.** While it sits in the brain dump it is neither.
- Both matrices **live in one file** — the side is a field on each task. Nothing extra to back up.

### Window modes

- The bar is **640×48**. The Work/Life toggle pushed the window buttons off the old 440px, and the update button widened it once more.
- The only things that drop out of the bar are **the app name and the version beside it**. The icon, the toggle, the count chips, the gear and the window buttons all stay.
- **The window expands from wherever you left the bar.** Parked against the right edge it opens leftwards so it never lands off-screen, and folding it puts the bar back where it was.
- Position, size, mode, theme and the pin all survive a quit. **Only the expanded size is stored** — save the bar's size and the app would open 640×48 next time.

### Brain dump (the list above the matrix)

Somewhere to pour out what is in your head before sorting any of it. It sits directly above the matrix.

**It is the one list both matrices share** (the `Shared` mark in its header). Which side a task belongs to is settled later, when it goes down into a quadrant.

- Pasting several lines at once takes **up to 100 lines**.
- A long list **never pushes the matrix out.** It grows to a set height and scrolls inside itself after that.
- Due dates, notes and completion only attach once a task is in a quadrant. Brain dump rows have none of the three, **deliberately**.

### Matrix tab

- The four quadrants are named after the axes and keep those names in both languages: **`Urgent & Important` / `Important & Not Urgent` / `Urgent & Not Important` / `Not Urgent & Not Important`**. Under each one sits `Do it now` · `Plan it` · `Delegate it` · `Delete it`, which is why the four Ds have to survive translation.
- Order inside a quadrant comes from **a sort key on each task** rather than its position in an array, so moving one task does not rewrite the whole list.
- **The count turns red once quadrant 1 holds more than five.** It means you are chasing whatever is loudest, and it is usually the result of putting quadrant 2 off (see the [Guide tab](#guide-tab)). **It does not stop you** — refusing to let somebody write a task down just puts it back in their head. No other quadrant has this mark. A full quadrant 2 is a sign you are doing well.

### Resizing the quadrants

Drag the edges to change the split. The ratio is **clamped to 0.15–0.85** and survives a quit. There is no separate resize control: this is a widget that sits on your screen all day, and pixels are not worth spending on one.

### Due dates

The time left falls into four bands — **overdue / today / within three days / later** — and the app recalculates at midnight even after days of running, waking from sleep included. The format differs by language, and the day names come from `Intl` rather than the catalogues.

### Notes

One note per task, **up to 2000 characters**, stored alongside the task in `data.json`.

The note panel **grows the window instead of taking height from the matrix**, so it never disturbs the split you dragged the quadrants to; if the screen has no room it takes what it can. In the history and the trash notes are read-only.

### Export

Writes the current **brain dump plus four quadrants** as PDF, HTML or Markdown.

- **Only the side you are on goes out**, and the document title and default file name say which (`Nekan Work 2026-08-02.pdf`).
- **Completed tasks and the trash are not included.** Only what is live right now.
- The HTML references no external files, so it can be sent on as it is.
- PDFs are always built with the **light palette** — printing a dark theme gives you a black sheet.
- The document is built in the main process, not the renderer. Its shape lives in `src/shared/export.ts` alone and has nothing to do with `src/renderer/styles/`.

### History tab · Trash tab

Completed tasks stack up in the history, deleted ones in the trash, both grouped by date. Both show **only the matrix you are on**.

- Search covers **the whole record**, not the rows that happen to be drawn.
- **Twenty rows to a page** (a row costs about 180µs, and that is the cap that keeps typing in the search box from stuttering). The rest are a page number away below the list, and **nothing is being removed**.
- A task deleted straight from the brain dump has no side, so it shows in **both** trashes. `Empty the trash` clears **everything the tab is holding** — not the page in front of you, but the whole record for the matrix you are on.
- A task deleted forever never reappears anywhere, but **a tombstone stays in the file for 90 days.** It stops a device that has not synced yet from putting the task back; the text and the note go immediately.

### Guide tab

**The manual for somebody who has the app open.** It holds what the Eisenhower matrix is and **everything about using this app**, keyboard shortcuts included. The line between that tab and this file is that **the tab has to be enough on its own**.

**It comes in two layers.** Opening it shows the four boxes in miniature, the three steps of the loop and four lines of basics; everything else is behind five disclosures below them (What is the Eisenhower matrix? · Tasks and the brain dump · Due dates and notes · Records and export · Window, shortcuts, sync). **It is folded, not shortened** — not one paragraph of the operating instructions was cut.

- **The update state and the running version** are at the bottom of it, with a link to the release notes (which opens in your usual browser).
- The prose lives in `guide.*` in `src/shared/i18n/{ko,en}.json`; `#guideView` in `src/renderer/index.html` is the set of slots it goes into.

## The icon

`build\icon.ico` (multi-size, 16–256px) is used for the exe, the taskbar and the title-bar logo alike.
To change the design, edit the colours and regenerate it.

The four quadrant colours were once **this icon's hues and saturations with only their lightness moved**
(never the same hex). On 2026-08-28 the quadrants went to louder values and the two parted company, so if you
redraw the icon, `QUAD` in `src/shared/theme.ts` is what to match it to.

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-icon.ps1
```

## Where the data lives

```text
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

```text
build/icon.ico         # exe / taskbar icon
tools/make-icon.ps1    # icon generator
tools/seed-dev-data.js # bulk dummy data (for performance checks)
tools/dist.js          # packaging entry point -- dist, dist:mac and release all go through it
tools/check-release.js # inspects and repairs release drafts (called by dist.js)
tools/find-untranslated.js # counts the Korean still baked into the source
src/                   # what you write (TypeScript)
  main.ts              # app lifecycle and assembly
  preload.ts           # the contextBridge IPC bridge
  assets/icon.*        # icon copies used at runtime
  main/
    store.ts           # in-memory copy of data.json + debounced saving
    store-io.ts        # reading and writing data.json (temp write + rename)
    window.ts          # window creation, expanded/bar modes
    export-service.ts  # writing PDF / HTML / MD
    updater.ts         # checking GitHub Releases · background downloads
    api-client.ts      # the one place that talks to Supabase
    token-store.ts     # the session, encrypted into auth.json
    sync.ts            # the pull / push / retry loop
    oauth.ts           # the browser side of Google sign-in (PKCE + loopback)
    i18n.ts            # strings for the main process
    ipc.ts             # every ipcMain handler
  shared/              # main, renderer and tests. Uses neither Node nor the DOM
    types.ts           # the vocabulary: Task, Place, Space, Layout, Session
    core.ts            # dates, normalisation, layout ratios, Work/Life rules
    export.ts          # building the export documents (Markdown / print HTML → PDF)
    sync.ts            # sync decisions (last-write-wins, row mapping, cursors, clock skew)
    auth.ts            # session shape and expiry
    i18n/              # ko.json · en.json · GLOSSARY.md · locales.ts
  renderer/            # React (bundled by Vite — imports keep their .js extension)
    index.html
    app.ts             # entry point: render dispatcher, shortcuts, init
    store.ts           # the task array and every change to it (knows nothing of the DOM)
    render-bus.ts      # the one "redraw" signal
    i18n.ts            # strings for the renderer
    dom.ts             # shared DOM helpers
    selection.ts       # whose note the panel is showing
    panels.ts          # whether the settings popover is open
    react/             # icons, the store subscription hook, test helpers
    components/        # due chip, note marker, toast, editable text, add form
    views/             # quadrants · brain dump · history/trash · note panel · account · settings · first run
    window/            # title bar and tabs · bar/window mode · quadrant edges ·
                       #   drag and drop · export
    styles/            # 15 files by area (light/dark palettes in base.css, the shared toggle in switch.css)
out/                   # built by `npm run build`. This is what actually runs
test/                  # node --test unit tests (TypeScript)
                       #   component tests run under vitest, beside the source
```

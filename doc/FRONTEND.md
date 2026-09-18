# The frontend

The Angular application in `frontend/`. Angular 22 · TypeScript 6 ·
PrimeNG 21 with an Avisi Aura preset · PrimeIcons · Wails v3 bindings · Vitest ·
ESLint with angular-eslint · Prettier.

For what the product is, see [`../README.md`](../README.md). For how
commands reach the CLI, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

```sh
npm run dev     # ng serve on 127.0.0.1:4200
npm run build
npm test
npm run check   # the same formatting, lint, build and tests as GitHub
```

The browser dev server is useful for layout work, but anything that calls the
backend needs the real app (`make dev` from the repository root).

## Structure

```
src/app/
  app.ts / app.html / app.css   shell: sidebar, playhouse selector, account menu
  app.routes.ts                 route map, lazy-loaded screens
  core/
    services/                   app-wide state, backend calls, catalogs, console, toasts, page loading
      scope.ts                  context, organisation, playhouse list, and switching between them
      acloud-session.ts         acloud version, compatibility, tool statuses, signing in and out
      window-chrome.ts          native window background and the space its controls need
    guards/                     playhouse-guard
  features/
    playhouse/                  playhouse selection + create drawer
    playroom/                   room list, room detail, create drawer
    defaults/                   the settings screen
  shared/
    components/                 reusable UI and shared playroom action surfaces
    directives/                 behaviour attached to PrimeNG controls
    models/ data/ utils/        types, constants, helpers
    styles/                     tokens, and the styles shared across screens
  styles.css                    global entry point and PrimeNG overrides
```

## Routes

`/` redirects to `/rooms`.

| Route          | Screen                    |
| -------------- | ------------------------- |
| `/playhouse`   | playhouse selection       |
| `/rooms`       | playroom list (guarded)   |
| `/rooms/:name` | playroom detail (guarded) |
| `/settings`    | defaults                  |

`core/guards/playhouse-guard.ts` sends the user to `/playhouse` when no
playhouse is selected and the backend has no cached one.

## Talking to the backend

Everything goes through `core/services/wails-api.ts`, the one file that touches
the generated bindings. Nothing else in the app imports `bindings/`.

**Input types are not declared by hand.** They are the generated model classes,
which come from the Go structs, so a field added on the Go side appears here and
a field removed there breaks the build. Their constructors take a `Partial` and
fill in zero values, matching the backend contract: a field the GUI does not set
is left off the command line, so the CLI's own default applies.

Regenerate after changing any exported Go method or input struct:

```sh
make build
```

Never edit `bindings/` by hand.

### The activity log

Anything a user starts runs through `CliConsoleService`, which records the
command and its real output:

```ts
let runId = '';
await this.console.run(`Creating "${name}"`, (opId) => {
  runId = opId;
  this.notify.toast(`Creating "${name}" ...`, 'busy', opId);
  return wailsApi.createPlayroom(opId, input);
});
this.notify.toast(`Created "${name}"`, 'ok', runId);
```

The log stays **closed** by default. The toast and the room's own state are what
a user sees; the log opens from the Activity button in the sidebar footer, from
clicking a toast, or by itself when a command fails. It is one continuous
scrollback for the whole session, held in memory.

Pass the operation id to `toast()` and the toast becomes a link into the log at
that command.

Polled reads deliberately skip all of this — they run without an operation id,
so they emit nothing. A room list refreshing every ten seconds would bury
everything worth reading.

### When a command fails

A failure is shown in the three parts acloud's own messages are written in:
**what the user was doing**, **why it failed**, and **what to do about it**.

```ts
this.notify.failure(`Could not start "${room.name}"`, error, runId);
```

The caller supplies the first part, because only the caller knows it. The other
two come from `explainFailure()` in `shared/utils/cli-error.ts`, which unwraps
whatever was thrown — a JSON-shaped binding rejection, an HTML error page, a
plain string — and splits the CLI's message at the `; ` its messages use to
introduce a remedy, or at the lines a failure printed after itself. A message
written any other way simply has no remedy and reads exactly as it did before;
nothing is rewritten or invented.

```
Could not start "ai-buddy"
Playroom "ai-buddy" is owned by jasper@avisi.nl, not you (sem@avisi.nl)
Pass --force to act on it anyway
```

Failures are sticky, and the activity log behind the toast is the full story.
`describeError()` is the same reading collapsed to one line, for the inline
error states that have room for one.

Before this, every call site passed `String(error)` — which prefixes a thrown
error with its class name, so the JSON a rejected binding call carries stopped
looking like JSON, and the whole blob
(`{"message":"…","cause":{"Arguments":…`) went on screen as the explanation.

### Command previews

`CommandPreviewComponent` owns the preview lifecycle. A form passes it the
backend preview function and the result of its `toInput()` method; the component
fingerprints that input, ignores stale responses, and disables requests while
its overlay is closed. The same `toInput()` result is submitted, so the preview
and the action cannot describe different commands. The frontend never assembles
command lines.

## State

State that must outlive a screen lives in a service, because every screen is
destroyed on navigation.

**`app.ts` holds none of it.** The shell turns service state into menus and
decides what happens on screen when one of them finishes something; that is all.
It used to own the scope pickers, the playhouse list, auth, the version, the
tool statuses and the native window as well, which made it the largest file in
the app and put the same "clear what belonged to the old scope" block in two
places, where they drifted. Those are now `ScopeService`,
`AcloudSessionService` and `WindowChromeService`.

`core/services/scope.ts` owns the top of the sidebar hierarchy: the current
context and organisation, the lists to switch between, the playhouses inside the
current organisation, and the switch itself. A switch returns a result rather
than raising its own toast, so the shell stays the only thing that talks to the
user.

`core/services/acloud-session.ts` owns what the GUI knows about the acloud it is
driving — version, compatibility notice, whether tailscale and ssh are on
the `PATH` — and who is signed in to it. The two halves of an interactive login
are deliberately separate: `openLoginInTerminal()` returns as soon as the
terminal is up, and `waitForCredentialsToAppear()` is the half that knows
whether it actually worked. Treating the first as success is what used to make
the GUI say "Signed in" to someone who had closed the terminal.

`core/services/window-chrome.ts` keeps the native window in step with the app:
the gap macOS traffic lights need, and the background colour behind the page.
Both have to happen in the window rather than in CSS, because the background is
what shows at launch before the first paint and in the gap during a live resize.

`core/services/playroom-state.ts` holds the selected playhouse, user, theme and
room list as signals. Two fields there exist because of specific bugs:

- `scopeRevision` ticks on every context or organisation switch. Screens watch
  it and reload, since a switch invalidates everything below it whether or not
  it navigates anywhere.
- `roomsLoadedFor` records which playhouse the current room list belongs to.
  Without it, returning to `/rooms` replaced a populated grid with loading
  skeletons even though the data had not moved.

`core/services/playhouse-jobs.ts` owns playhouse creates and deletes. They run
for many minutes and must outlive the screen that started them: when that state
lived on the component, navigating away and back lost the progress banner and
the polling while the command was still running.

`core/services/playroom-defaults.ts` caches the user's `playroom config`
defaults so the create drawer and connect dialog open on the values the Defaults
screen shows, rather than on constants compiled into the frontend.

`core/services/image-catalog.ts` similarly owns the immutable image-flavor
catalog. Create, update and Defaults share one successful request per session;
a failed request is not cached, so opening a surface again can retry.

The Defaults page describes each supported key once in a typed registry: its
group, control kind and options live together. Unknown keys returned by a newer
CLI remain editable under an Other group instead of disappearing from the UI.

The room list and room detail page both delegate connect, update and delete
overlays to `PlayroomActionsHostComponent`. It owns the selected room, delete
options and preview, and emits after a successful deletion. This keeps the same
irreversible action identical from both entry points. Repeating string flag
controls (`--env`, `--git`, `--copy`, `--port`) use one shared list editor that
also guarantees the form retains an editable blank row.

`shared/utils/cache.ts` persists the last playhouse, playroom, editor, terminal
and theme to localStorage under `acloud-playroom-gui-cache`.

## Scope: context and organisation

The sidebar reads top-down as a hierarchy — context → organisation → playhouse →
playrooms — and the top two are pickers backed by `config use-context` and
`config use-organisation`.

The CLI offers those lists through fzf, but that is only how it obtains an
argument: both commands take the value directly. The GUI renders the list and
passes the choice. See [`DECISIONS.md`](DECISIONS.md).

Both go through `ScopeService`, which runs the command, clears everything that
belonged to the scope being left, and re-reads context _and_ organisation (a
context carries its own organisation, so switching one moves the other). `app.ts`
does the part the user sees: the toast, and the return to playhouse selection.

The clearing is one method — `forgetEverythingBelongingToPreviousScope()` — and
signing out calls the same one. It used to be a copy in each, which is how the
two came to clear slightly different things.

The playhouse picker below them is the same control: a menu of what you can
switch to, capped at five with the selected one first, ending in **View all /
Create** — the `/playhouse` screen, where status, version, create and delete
live. The row names creating as well as listing because someone who opens this
menu and does not find the playhouse they want is looking for how to make one,
and "View all" alone does not tell them they can. It opens on the list it already has and re-reads underneath, because the
list changes from that screen, from a background create, and from a terminal.
It used to be a button that only navigated, which made the third level of one
hierarchy behave unlike the two above it.

Switching writes to `~/.acloud.yaml`, so it moves the user's terminal too.

## Playroom status

`mapStatus()` in `shared/utils/playroom-mappers.ts` folds backend status strings
into the GUI's status keys, and `shared/data/status.ts` holds their labels,
tones and descriptions. When the backend gains a status, update both together —
cards, tags, polling and copy all read from them.

An unrecognised status maps to `unknown` rather than to a guess. It keeps
polling, because the alternative — calling it `creating` — told users a room was
being provisioned when nobody knew that.

Rooms reload every 10 seconds while any room is in a transitional state. A tick
that arrives while the previous read is still running is dropped rather than
queued, so a slow list cannot stack subprocesses behind itself. A read the
_user_ caused is repeated instead of dropped: it may be for a different
playhouse than the one being fetched, and dropping it left the new playhouse
showing nothing at all.

The list screen reads the rooms from an effect on the selected playhouse, not
from `ngOnInit` alone. Choosing a playhouse in the sidebar navigates to `/rooms`
— the route the screen is already on when it is open — so Angular reuses the
component and no second `ngOnInit` fires. Arriving from another screen still
reads exactly once: the effect's first run is that read.

## Loading

There is **one** loading indicator in the app: the Avisi mark in the main panel
breathes while work the user asked for is in flight (`shellBusy()` in `app.ts`,
held to a cycle boundary by `keepMarkBreathingUntilCycleEnds`, over
`core/services/page-loading.ts` and `CliConsoleService.isRunning`;
`.main-panel.is-loading` in `app.css`). That is three things — a screen's first
load, a Refresh, and any command in the activity log — and screens render
nothing while they wait for the first of them.

Commands are included because the activity indicator in the sidebar footer is a
dot in a corner of a panel that stays closed: a twenty-minute playhouse create
was invisible from every other screen. It is the same rule as the log's, so the
two always agree.

What is excluded is everything nobody asked for. The ten-second room poll and
the fifteen-second playhouse poll pass `background`, and commands only reach the
log when they carry an operation id, which polled reads do not. A poll that
pulsed the mark would blink it every ten seconds for as long as a room was
starting up — the state where the indicator most needs to mean something.

They used to say it themselves — a grid of shimmering skeleton cards on the
room list, a centred spinner on the other three — which redrew the whole
content area to announce a wait usually under a second, and put a card-shaped
placeholder where cards were about to appear.

`runAndShowIndicatorIf(showIndicator, work)` takes the decision explicitly, because only a read with
nothing behind it counts: the ten-second room poll, the fifteen-second
playhouse poll and the Refresh buttons all run behind content that is already
on screen, and Refresh has its own spinner. A screen that renders nothing still
owes a screen reader the word — hence the `.sr-only` status line in each
loading branch.

## Design

A dense operational console, not a landing page: persistent navigation, compact
cards exposing status/owner/image/age/host with direct actions, drawers for
creation and editing, dialogs for short decisions, typed confirmation for
deletes.

The shell's styles are four component stylesheets rather than one, listed in
`styleUrls` on the App component: `app.css` (the frame), `app-sidebar.css`,
`app-toast.css` and `app-main-panel.css` (the panel and the brand mark in it).
They are component-scoped, not shared — nothing else imports them. Genuinely
shared styles still live in `shared/styles/`.

The mark itself is two masked layers on `.main-panel` (`app-main-panel.css`): `::after` is
the watermark, `::before` is the brand gradient and the highlights that sweep
through it while `is-loading` is set. The SVG is a CSS mask rather than an
image, so one asset covers both themes and the colour comes from tokens —
`AvisiLetterDark.svg` is no longer referenced. There is no glow around the
silhouette because masking is applied after filters, so a drop-shadow on either
layer is cut away by the mask that shapes it.

Tokens live in `src/app/shared/styles/_tokens.css` (`--primary` Avisi deep blue
`#003345`, `--cyan` `#1199bb`, `--accent` `#1dd478`, plus surface and status
colours); the PrimeNG preset is in `src/app/app.config.ts`. Frontend brand
assets are in `public/brand/`; the macOS app-icon layer is kept inside the
required `build/appicon.icon/Assets/` package.

Dark mode is the default, applied by toggling `.app-dark` on `<html>`; PrimeNG
is configured to use that as its dark selector. The native window background is
set from the same choice, so the window does not flash the wrong colour at
startup or tear at the edges during a resize.

Avoid marketing sections, hero layouts, decorative graphics and nested cards.
The screens are used repeatedly, all day.

Overlay chrome lives in `shared/styles/_overlays.css`. Both the drawer and the
dialog are floating rounded panels with a dark gradient header, and both need
the same two rules to look it: `border: 0` on the panel — PrimeNG's own 1px
surface-200 hairline reads as a pale outline tracing the corners of a dark
header — and the panel's radius repeated on the header's top corners, or the
panel's light background shows through the curve.

A field offers **one** place to type. An editable `p-select` already accepts
free text in its trigger, so PrimeNG's `[filter]` — a second search box inside
the overlay — is not used with it; `appTypeToFilter`
(`shared/directives/type-to-filter-select.ts`) narrows the list from the
trigger instead, using the same `filterBy` fields.

On the Defaults screen, a value that is no longer the built-in one is shown in
green on the control itself — the slider range and handle, the current value,
the control's border — and the built-in reference beside it gains contrast so
the two can be compared. The source tag says where an override came from;
colour says that there is one, which a badge at the far left of the row did not
convey. Unsaved edits stay a separate, cyan state: a saved override has to
remain visible after the dirty tint clears.

## Naming

**A function name is a short sentence about what the caller gets.** Verb first,
and long is fine — `loadImageCatalogOnce()` over `load()`,
`typedTextMatchesTarget()` over `matches()`, `removeValueAt(index)` over
`remove(index)`. Someone who does not work on this app should be able to read a
call site and know what happens.

The convention already existed here before it was written down — in the test
names. `it('retains one blank row after removing the last value')` and
`TestRunRejectsArgvTheGUIMustNeverExecute` are exactly the standard, applied to
the thing being described rather than to the thing itself. **So: name the
function the way you would name its test.**

Two limits worth knowing.

**Go reads at the call site, not the declaration.** A Go name is package-
qualified, so `cli.Run`, `playroom.Delete` and `local.CurrentUser` are already
sentences and renaming them to `playroom.DeletePlayroom` only stutters. The rule
bites on unexported helpers, which have no package prefix to lean on — that is
where `validateArgs` became `rejectArgumentsTheGUIMustNeverRun` and `binary()` became
`pathToOwnExecutable()`.

**Framework names are contracts, not choices.** Angular lifecycle hooks
(`ngOnInit`, `ngOnChanges`), Wails binding methods and anything under
`bindings/` keep the name the framework expects.

### The same rule for everything else you name

A name that only its author can expand is a name that has to be looked up. So
the rule reaches past function names to every identifier written here.

**Receivers are their type in lowerCamelCase** — `commandArguments`, `runner`,
`app`, `exitError`. There is no judgement call per type and no abbreviating;
where the type name would shadow the type itself, the type was the thing worth
renaming (`capture` became `boundedBuffer`).

**Parameters, locals and fields get the word a reader would say out loud** —
`data` not `p`, `options` not `opts`, `room` not `r`, `interfaceCmd` not `ic`,
`workingDirectory` not `wd`, `mutex` not `mu`. Lambda parameters are not
exempt: `rooms.filter((room) => ...)`, not `(r)`.

**The exception is a genuine idiom, not merely a short name.** `ctx`, `err`,
`ok`, `got`, `want` and `i` as a loop index read identically to every Go
programmer, and spelling them out costs clarity rather than adding it. An
abbreviation that only looks idiomatic — `opts`, `mu`, `ph` — does not qualify.

**One concept, one name.** An operation id is `operationID` in Go and
`operationId` in TypeScript, on both sides of the Wails boundary and at every
layer in between. It was `opID`, `operationID`, `opId` and `runId` before, and
the only way to know they were the same value was to follow it through.

## Checks and house style

```sh
npm run check        # format:check + lint + build + test, fastest failure first
npm run format       # Prettier writes the formatting
npm run lint:fix     # ESLint writes what it can
```

Prettier owns formatting and nothing in `eslint.config.mjs` reformats code, so
the two never fight over a line. ESLint additionally enforces the casing half of
the naming rule above; the sentence half is a review matter, because no linter
can see it.

The linter reports **no errors and roughly seventy warnings**, and that split is
deliberate. The warnings are one backlog: nearly every field label in the app is
a plain `<label>` beside its PrimeNG control rather than bound to it, which a
screen reader cannot associate. Fixing it means threading `inputId` through
around sixty controls across ten templates — real work with real UI risk, and
its own task rather than a side effect of turning the linter on. Leaving them as
warnings keeps the count visible and stops it growing quietly. A handful of
clickable non-button elements (the toast body, a console line, a room card)
need a keyboard path for the same reason and are counted the same way.

`bindings/` is excluded from both tools. It is generated, and formatting it
would only be undone by the next `wails3 generate bindings`.

`src/test-setup.ts` (wired up as `setupFiles` on the test target in
`angular.json`) clears the intervals a test file leaves running when it ends.
It exists for one of them: the Wails runtime polls for a browser window for
five seconds after it is imported, and once a file's DOM is torn down that poll
throws `window is not defined` into whichever file is running next — failing a
suite that has nothing to do with it, and only when the timing lines up.

## Keeping the UI in step with the backend

`core/services/input-coverage.spec.ts` requires every field on a generated input
model to be either wired to a control or listed as deliberately unwired, with a
reason. The models are generated from the Go structs, so a flag added on the Go
side fails this test until someone gives it a control or writes down why not.

Go argument tests check serialization; this test accounts for the input fields
exposed by those builders. Neither checks against the private CLI command tree
in this standalone repository. See [`ARCHITECTURE.md`](ARCHITECTURE.md#coverage-and-its-limits).

**What these tests cannot see** is whether anything opens the control. The Play
dialog wired all fifteen of its fields, passed this test, and sat unreachable in
a shipping build because the button that opened it had been removed. If you add
a screen, add the way in at the same time.

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
    setup/                      the setup a new install walks through
  shared/
    components/                 reusable UI and shared playroom action surfaces
    directives/                 behaviour attached to PrimeNG controls
    models/ data/ utils/        types, constants, helpers
    styles/                     tokens, and the styles shared across screens
  styles.css                    global entry point and PrimeNG overrides
```

## Routes

`/` redirects to `/setup` until setup has been completed once, and to `/rooms`
after that.

| Route              | Screen                       |
| ------------------ | ---------------------------- |
| `/setup`           | setup                        |
| `/playhouse`       | playhouse selection          |
| `/rooms`           | playroom list (guarded)      |
| `/rooms/:name`     | playroom detail (guarded)    |
| `/defaults`        | playroom defaults            |
| `/settings`        | local tools and app settings |
| `/settings/health` | health check                 |

`core/guards/playhouse-guard.ts` sends the user to `/playhouse` when no
playhouse is selected and the backend has no cached one.

### Deep links

The desktop bundle registers `acloud-playrooms://`. Links use the current context
and organisation; the app checks a fresh playhouse list and refuses unavailable
playhouses or a selection changed during validation. It never switches context
or organisation. A validated link may select a playhouse inside that scope.

- `acloud-playrooms://rooms/<playhouse>/<room>` opens room details.
- `acloud-playrooms://connect/<playhouse>/<room>` opens the Connect dialog.
- `acloud-playrooms://create?playhouse=<playhouse>` opens the create drawer.

Names are percent encoded. Unknown paths, extra parameters and malformed names
are refused. Links only open screens: Connect and Create still require the user
to submit the existing dialog or drawer. **Copy link** in room details copies the
room URL. Links intentionally carry no credentials, context or organisation.

`DeepLinksService` starts after shell initialization. Native URL events wait for
its listener before delivery, including on a cold launch. The router's one-use
`connect` and `create` parameters open the existing surfaces and are then cleared.
Dummy mode accepts a `dummy:deep-link` window CustomEvent with the URL as its
string detail, for browser tests without registering an operating system scheme.

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
clicking a toast, or by itself when a command fails. Each command has its own
entry with a start time, reported duration, exit code
and status (OK, Failed or Running). Cancelled commands and terminal handoffs
are labeled separately; missing timing or exit codes say **Not reported**.
Entries remain in memory for the session, bounded to the latest 5,000 lines.

Output folds per entry. More than 20 lines or 2,000 characters starts folded;
Show output reveals it. **All / Failures only** and **Search output** combine to
filter entries. Opening a command from a notification or room resets filters so
that command is visible. Copy command and Copy output copy that entry's retained
text. Copy whole log and **Export log…** include all retained entries, regardless
of filters or folding, with their timing and status. Export uses a native save
dialog (cancellation saves nothing); dummy mode downloads `activity-log.txt`.
Both use only the already redacted text, never a second source of CLI output.

Pass the operation id to `toast()` and the toast becomes a link into the log at
that command. The banner itself is the link, with Enter and Space support;
recognised failures also offer a separate fix button beside the Activity link. Dismissal only closes the toast.

Polled reads deliberately skip all of this — they run without an operation id,
so they emit nothing. A room list refreshing itself every minute, or every ten
seconds while a room changes, would bury everything worth reading.

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

All notifications disappear after five seconds, including failures and hovered
notifications. A small countdown bar shows the remaining time. The sidebar's
Notifications button opens this session's history, newest first, with full
messages, remedies, timestamps and links to Activity for command notifications.
History stays in memory and resets when the app restarts.
Recognised failures offer **Sign in to the playhouse again** (repeat the original
command with `--force-install`), **Update playroom**, or **Go to Options** for an
image requiring privileged mode. The action also stays in notification history;
list read failures expose it inline. Matchers in `shared/utils/cli-error.ts` read
the full CLI message, never a truncated toast. Unknown messages keep their current
presentation. Fixes preserve command inputs and refuse after the selection or
scope changes. Disposable rooms are never offered an in-place update.

For NodePort, Connect offers **Add my current IP to the allowlist** only for the
active playhouse and a selected NodePort path (including the configured default).
It shows the backend preview, then requires confirmation before running
`playhouse update <name> --allow-current-ip`. Success offers **Connect again**.
The app cannot inspect SSH errors in an external terminal or infer a room's
unreported exposure; select NodePort explicitly when its path is otherwise unknown.

Dummy mode supports `?failure=session` on the room list, `?failure=outdated`
then starting a stopped room, and `?failure=privileged` then creating a room.
Each simulates one failure per page load; fixes and allowlist updates stay simulated.

`describeError()` is the same reading collapsed to one line, for the inline
error states that have room for one.

### Desktop notifications and Dock badge

Settings → Notifications saves two device preferences: **Desktop notifications**
(on by default) and **Dock badge** (Failed rooms by default, Running rooms, or Off).
Room create, start, stop and delete, plus playhouse setup and update, notify on
success or failure only while the window is unfocused. macOS permission is asked
when the first notification would be sent; denial is not repeatedly prompted.
Native failures are logged without changing command results or in-app history.

Commands that wait notify when they return. Room start and no-wait create/delete
wait for the room list to report Ready, Failed, or deletion. Each submitted task
notifies once; unrelated polled transitions do not notify. A scope or playhouse
change stops watching pending no-wait tasks, and a new task replaces the previous
watch for that room. Notifications already delivered retain their original selection.
Clicking brings the app forward and opens the room only if that selection is
still current. Otherwise, including a previous app session or a playhouse task,
it opens the Playrooms overview without switching scope.

The Dock badge counts reported Failed rooms, or Ready and No host rooms for
Running rooms, in the loaded current playhouse. Zero and Off remove it. Updates
are debounced by 150 ms; selection changes clear the previous badge immediately.
Dummy mode logs notification requests and badge counts instead of using macOS.

### Menu bar

`core/services/menu-bar.ts` pushes the current playhouse's room list to the
native menu bar whenever the list, its loaded state or a room's running task
changes; age ticks alone do not rebuild it. Go never reads the list itself. Rooms
are sorted by name and carry the room card's status label. A room chosen there
comes back as a `menu-bar:action` event and runs through the room card's paths:
start and stop through `PlayroomLifecycleService`, connect and open through
`PlayroomConnectService`. Connect skips the dialog and uses what it would open
on: the configured user and agent forwarding, and the last terminal. Open uses the
last editor. A request for a room that is gone, in another playhouse, in another
status or busy runs nothing; it shows the window with a warning. Connect and open
failures also show the window, with the same fixes as the connect dialog.

Settings → Menu bar saves **Keep running in the menu bar** (off by default) and
sends it to Go at startup and on change. Dummy mode logs both pushes.

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
command lines. Copy shows **Copied** briefly; flag names have a separate theme
color from values, with quotes and spacing preserved by `splitCommandPreview`.
The dummy preview labels its commands `dummy-preview` and emits simulated
activity for room and playhouse actions without running acloud.

### Reviewing updates

Both update drawers use each control’s existing hint for current → proposed
values or "Unchanged", tint edited cards cyan like unsaved Defaults, and count
changes above the submit buttons. Blank fields and disabled replacement toggles
keep the current setting. Each drawer's pure `describeChanges(current, form)`
feeds the comparisons, tint and count, including drafts restored for a playroom.
Unreported current values show "Not reported → proposed" only after a setting
is edited; unchanged unknown settings have no comparison. Playhouse list reports
no editable settings, so choosing one counts without assuming its current value.
Credentials only say "Replacement supplied".

Run options and allowlist actions have no comparison. They still count as changes
and appear by name in the summary when used. Playroom spec changes (image, CPU, memory, read-only system, capabilities, namespace), or an
outdated room layout, warn that the playroom may restart and disconnect SSH.
Storage, forwarded ports and connectivity changes alone do not show that warning.
Ephemeral storage cannot be changed here.

### Easy and Advanced create

The create-playroom drawer shows one form in two modes. **Easy** is one screen
with name, image and size; **Advanced** is the five-step wizard with every
option. Both edit the same `CreateForm` and send the same `toInput()`, so
switching never adds or drops a flag, and the command preview stays on screen in
both. The size is read from the four CPU and memory values rather than stored,
so it cannot disagree with what is sent, and Easy says how many advanced options
differ from your defaults instead of hiding them. The chosen mode is remembered
in the local cache. Option names and their one-line explanations live in
`shared/data/playroom-options.ts`, keyed by CLI flag, so the create, update and
Defaults screens use the same words.

The Forwarding step reports Set / Not set under each bare environment key and
warns that inline `KEY=VALUE` entries enter the command line. Settings can opt into
reading the login shell; only that boolean is cached. Create asks before omitting
a missing key, including in Easy mode with a restored draft. A failed presence
check blocks submission. Resolved values never enter the frontend.

The name field checks the loaded rooms in the selected playhouse while typing and
shows **Already used in this playhouse**. Invalid names offer a **Use …** button
that lowercases, replaces spaces and underscores with dashes, drops invalid
characters and trims edge dashes. The CLI still validates the submitted name.

**Create similar** in a card's menu or the room details menu starts Advanced on
Basics with an empty name, replacing the restored draft. Reported image, CPU,
memory, storage size, ports, known capability profile, additions and ephemeral
storage override the configured defaults. Everything else keeps its defaults,
with a **Not copied** hint naming those settings. Privileged mode starts off and
still requires acknowledgement. Closing saves this form as the new create draft.

### Requested resources

The overview's title row shows requested CPU, memory and storage for all loaded
rooms, including stopped rooms. Search, status, Mine and owner grouping do not
change these totals. The row uses short labels (`4.5 CPU · 18 GiB · 140 GiB`,
rounded to 2 decimals); at the 900px window minimum it wraps under the title and
keeps CPU and memory. Click it for the full totals, yours, and counts such as
**2 rooms without a CPU request**; a warning icon marks that some are missing.
Missing ownership says **Not reported** for yours.
`shared/utils/requested-resources.ts` parses Kubernetes decimal, binary and
exponent quantities into cores and bytes, then shows memory and storage in GiB.
Missing, malformed, negative or non-finite quantities stay unknown; explicit
zero remains known. No capacity or percentage is inferred from these requests.

### Bulk playroom actions

The overview keeps selection in page signals, outside the cache. Select playrooms
shows card checkboxes; Command-click (or Control-click) toggles a room and
Shift-click adds the visible range. Select all mine selects owned rooms matching
the current filters. Unknown ownership cannot be selected. Changing playhouse or
scope clears selection and any open bulk delete confirmation.

Start applies to stopped rooms, Stop to Ready or No host rooms, Update outdated
to outdated persistent rooms, and Delete to rooms outside a transition. Delete
lists every submitted name and requires typing `delete` once. `runForEach` runs
commands sequentially because CLI config writes can race (see DECISIONS,
Concurrency). It rechecks ownership, scope, pending commands and eligibility
before each command, continues after failures, and publishes each room's progress
and a final succeeded/failed/skipped summary. Success means the CLI accepted the
command; Start still settles through normal polling. Each command uses the usual
lifecycle activity entry. Bulk runs suppress per-room progress and success toasts;
failures remain in the summary and retain their usual error notification. Dummy
mode uses the same simulated lifecycle methods.

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

Settings shows separate Acloud command, Tailscale command and T3 Code path cards. Each supports
a typed path, a native file picker, checking again, and returning to automatic
lookup. The Tailscale choice is remembered across launches and applies to acloud
subprocesses and terminal connections. Saving or clearing it refreshes the sidebar
tool status. The cards live in `features/settings/components` and use
`shared/styles/_binary-card.css`; setup reuses the Acloud card. T3 Code is optional:
the saved app or CLI path is reserved for future integration and is not launched
or added to the command environment. Defaults remains dedicated to playroom defaults.

The health check (`features/settings/pages/health-check`, at `/settings/health`) runs
`CheckHealth` once on open and again with **Run again**. It is opened from the Settings
header and from the **Run health check** action on a connect or open failure that no
specific fix recognises (`CommandFixService.healthCheckAction`). It sends the terminal
and editor the connect dialog would open with. The Tailscale check is skipped only when
the selected playhouse's listed rooms report hosts and none is a `.ts.net` host; see
DECISIONS. Each result shows its status, explanation, fix, a copyable command and, for
acloud, Tailscale paths and sign-in, a button that opens Settings or signs in. **Copy
results** puts a plain-text summary with the app version on the clipboard.

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

`core/services/playroom-lifecycle.ts` owns room creation and updates as background
operations. Both drawers close as soon as a validated submission is accepted;
their X, Escape and dismissal remain available whenever open. Pending operations
prevent duplicate commands for the same room. Submitted input is copied, and
successful completion only clears that draft revision in the original selection.
Failures keep the draft in memory. Completion refreshes the applicable room list
without navigating, and a failed refresh is reported separately from the command.

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
also guarantees the form retains an editable blank row. Pasting several lines
into a row fills one row per line. `--git` wraps it in `GitRepositoryEditorComponent`,
which explains entries acloud would not clone, hints at a missing clone token from
the form's environment variables, and suggests recent repositories
(`shared/utils/git-repository.ts`; see DECISIONS).

`core/services/setup.ts` reads each setup step's status from the services above
and keeps `setupCompleted`. Setup opens at launch only: a fresh install through
the `/` redirect, and a completed one whose acloud or login broke through the
shell, once `ngOnInit` has read the installation. A cache from before setup
existed (no `setupCompleted` key) with a playhouse counts as completed, so
upgrades skip it.

`shared/utils/cache.ts` persists the last playhouse, playroom, editor, terminal,
theme, background grain, AME Robot, create-playroom mode, playroom view, owner grouping, pinned rooms, the last ten git repositories of
successful creates (URLs without ref or credentials) and `setupCompleted` to localStorage
under `acloud-playroom-gui-cache`. Background grain defaults to on; Settings →
Appearance applies changes immediately to the outer background and content panel.
The theme setting offers horizontal radio tiles for Light, Dark and System. System follows live changes to
the computer’s appearance, including the native window background. Theme controls
live in Settings. AME Robot defaults to on and can be hidden from Appearance.
Activity and Notifications share one row in the sidebar footer.

## Scope: context and organisation

The sidebar reads top-down as a hierarchy — context → organisation → playhouse →
playrooms — and the top two are switched with `config use-context` and
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

The sidebar shows all three in one **Working in** block, set apart from the
screen navigation: context and organisation on a row each, the playhouse on its
own line below. Names stay on one line and are cut short, with the full name on
hover, so a long playhouse name cannot push the block into the links below it. A
value acloud did not report reads "Not reported". The block opens the playhouse
chooser (`features/playhouse/components/playhouse-chooser`), where each level has
one line explaining it and changing context or organisation switches at once.
Signed out, the block says so and leads to setup instead; see
[`DECISIONS.md`](DECISIONS.md#working-in-leads-to-setup-only-when-signed-out).

Switching writes to `~/.acloud.yaml`, so it moves the user's terminal too.

The overview uses one active status chip, with counts after Search and Mine but
before the status filter. Only matching statuses appear, plus an active zero-count
status so the current filter remains visible. Search matches name, owner, image
and both forwarded port numbers. Stars on cards and details pin rooms per
playhouse; pins come first within every sort and persist across launches. A
successful list load drops pins for rooms no longer reported, while failed or
pending reads leave them intact. Old caches start with no pins. Stopped cards
use quieter theme surfaces and neutral text and actions without reduced opacity.

The overview's **Grid / List** buttons and **Group by owner** checkbox are saved
in `CacheState` as `playroomView` and `groupByOwner`. Existing caches open an
ungrouped grid. Both views use the same filters, sorting, pins, selection and
`PlayroomActionsHostComponent` overlays. The table's `PlayroomRowComponent`
inherits the card's presentational inputs, outputs and action behavior; its Size
column shows CPU and memory request / limit plus disk allocation. Missing row
metadata says **Not reported**; reported empty ports say **None**. Owners use
the same **you** / owner label as cards, with full owner names in title tooltips.
Name and Image truncate with title tooltips. The table fits its container with
compact icon actions always at the right; below 850px of table space, Size is
hidden and remains available in room details.

`sortPlayrooms` and `groupPlayroomsByOwner` are pure helpers. Groups show Mine
first only for a known current user, then full owner names alphabetically and
unreported ownership last. Counts reflect the current filters, and pins stay
first within each group. Groups collapse independently for the current screen;
a playhouse or scope change expands them again. Shift-selection follows the
expanded groups' displayed order. Select all mine still selects all matching
owned rooms, including collapsed ones. Grid/List changes preserve selection.

## Playroom status

The Playrooms and room detail headers share an organisation → playhouse breadcrumb;
details add the room name. It reads `ScopeService` and `PlayroomStateService` directly.
The playhouse button opens the same chooser as the sidebar. Names truncate within
the header, with full names in tooltips available on hover and keyboard focus.

`mapStatus()` in `shared/utils/playroom-mappers.ts` folds backend status strings
into the GUI's status keys, and `shared/data/status.ts` holds their labels,
tones and descriptions. When the backend gains a status, update both together —
cards, tags, polling and copy all read from them.

An unrecognised status maps to `unknown` rather than to a guess. It keeps
polling, because the alternative — calling it `creating` — told users a room was
being provisioned when nobody knew that.

Playhouse versions label the layout and Kubernetes version separately, in both
the table and its folded narrow-window content. Layout status says Up to date,
Update available, Needs newer acloud or Unknown, with an update action only where
supported. Room cards show update availability, and room details show configuration
status. Outdated disposable rooms say Recreate to update; no numeric room version
is inferred from the CLI's `Outdated` flag.

Room details separate Connection, Resources, Storage & security, and Metadata.
They retain the reported creation time and individual port mappings, show CLI
failure reasons, and explain disposable home-folder retention. The copyable
connection command comes from the backend builder with agent forwarding off;
preview failures are visible and retryable. Resource values are allocations,
not live measurements. Room Activity jumps to the latest retained command for
that room, playhouse and scope revision in this app session; it is not a durable
history. Switching scope never reassigns an in-flight command's association.

The room list refreshes itself in the background. `nextRefreshDelay()` in
`core/services/playroom-lifecycle.ts` decides when, and is the one place to
change it:

- every 10 seconds while a room is in a transitional state, every 60 seconds
  otherwise;
- paused while the window is hidden or minimised (`document.visibilitychange`),
  with one read straight away when it is shown again;
- after failed reads in a row it waits 60 seconds, 2 minutes, then 5 minutes
  until a read succeeds. Only the first failed poll in a row raises a
  notification; a failure the user's own Refresh already reported raises none.

Polling starts with the first read a screen makes for the current playhouse,
so nothing polls before setup or a playhouse choice. Editing rooms locally
(ages, optimistic patches) does not push the next read back. The Playrooms
header says when the list was last read ("Updated 8s ago",
`state.lastRefreshedAt`) next to its Refresh button.

A tick that arrives while the previous read is still running is dropped rather
than queued, so a slow list cannot stack subprocesses behind itself. A read the
_user_ caused is repeated instead of dropped: it may be for a different
playhouse than the one being fetched, and dropping it left the new playhouse
showing nothing at all.

The list screen reads the rooms from an effect on the selected playhouse, not
from `ngOnInit` alone. Choosing a playhouse in the sidebar navigates to `/rooms`
— the route the screen is already on when it is open — so Angular reuses the
component and no second `ngOnInit` fires. Arriving from another screen still
reads exactly once: the effect's first run is that read.

Room details and each card’s menu copy `ssh playroom-<name>`. The alias works
after the first Connect or Open, which writes the SSH configuration. Copy buttons
show Copied. Copy details exports the reported configuration, app launch version
and the same acloud version as the sidebar as plain text; missing facts say
Not reported.

Forwarded ports link to `http://<host>:<Port>` in the default browser and offer
a copy button. The CLI listing has no exposure field: only a reported MagicDNS
host ending in `.ts.net` enables a link and identifies Tailscale in copied details.
Other ports retain their numbers and say Reachable on the tailnet only; copying
one copies the exposed port number. Dummy mode simulates browser opening and
includes both tailnet and unlinked fixtures.

Settings → Preferred action chooses Connect, Open in editor or Nothing for a
ready card’s double-click. The typed `preferredAction` cache field defaults to
Nothing for old caches. Single click still opens details after a short delay so
a double-click can cancel navigation; keyboard activation opens details immediately.
Buttons inside a card keep their own actions, and busy rooms ignore double-clicks.

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

What is excluded is everything nobody asked for. The background room poll never
reaches `PageLoadingService`, the fifteen-second playhouse poll passes
`background`, and commands only reach the log when they carry an operation id,
which polled reads do not. A poll that pulsed the mark would blink it every ten
seconds for as long as a room was starting up — the state where the indicator
most needs to mean something.

There is no separate global Working message: room state, notification banners
and the Activity indicator provide progress alongside the breathing mark.

They used to say it themselves — a grid of shimmering skeleton cards on the
room list, a centred spinner on the other three — which redrew the whole
content area to announce a wait usually under a second, and put a card-shaped
placeholder where cards were about to appear.

`runAndShowIndicatorIf(showIndicator, work)` takes the decision explicitly, because only a read with
nothing behind it counts: the background room poll, the fifteen-second
playhouse poll and the Refresh buttons all run behind content that is already
on screen, and Refresh has its own spinner. A screen that renders nothing still
owes a screen reader the word — hence the `.sr-only` status line in each
loading branch.

## Design

A dense operational console, not a landing page: persistent navigation, compact
cards exposing status/owner/image/age/host with direct actions, drawers for
creation and editing, dialogs for short decisions, typed confirmation for
deletes.

An empty screen offers one next step. An empty playhouse offers "Create your
first playroom", which opens the create drawer in Easy mode whatever mode was
remembered; with a search or filter active it says nothing matches and offers
Clear filters instead. An organisation without playhouses offers "Create a
playhouse" and "Switch organisation", which opens the playhouse chooser.

The playroom delete dialog lists what goes with the room, one line each, through
the dialog's `consequences` input: the home folder with its size, and whether its
storage is persistent or ephemeral. `listDeleteConsequences()` builds the list
from what the room reports only: an unreported size and a storage type other
than those two get no line (`listingToRoom` still reads a missing `DiskType` as
persistent). `playroom list` reports no workspace namespace, so none is listed.

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

Defaults sliders move continuously between supported settings. Crossing a midpoint
changes the selected value; releasing snaps the thumb to that setting. Arrow keys
move one supported setting at a time, and Home/End select the track's endpoints.

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
npx playwright install chromium # once, to install the browser
npm run e2e         # Chromium flows against the dummy preview
```

Browser flow tests live in `frontend/e2e/`, with their server and Chromium project
configured in `playwright.config.ts`. `npm run e2e` (or `make e2e` from the root)
starts `npm run dev-dummy` on `127.0.0.1:4200`; locally it reuses an existing server,
which must be this checkout's dummy preview. CI always starts its own server.
Each test has an isolated browser context; dummy mutations reset on reload.
Every new screen or flow gets a browser test using `getByRole` or `getByLabel`
and assertions on user-visible results. Angular's unit-test include pattern is
relative to `src/`, and `tsconfig.spec.json` only includes `src/` and bindings,
so the browser specs are excluded from the unit-test run. `make check` stays
separate from `make e2e`. Prettier and ESLint check the browser specs too.
The HTML report is in `frontend/playwright-report/`; open it with
`npx playwright show-report` from `frontend/`. CI uploads it on failure and records
a trace on the first retry.

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

## Keyboard shortcuts and native menus

`ShortcutsService` owns the shared `APP_ACTIONS` action labels, shortcut registry,
the keyboard listener and the `menu:action` listener. The `?` overview renders that registry in the shell.
Page callbacks that change plain fields must notify Angular with `markForCheck()`;
service listeners do not mark the page like a template event does.
Shortcuts are ignored while typing, composing text, repeating a key, using other
modifiers, or while an overlay is open. App accelerators are consumed even when
guarded, so ⌘R never falls through to a webview reload.

| Keys    | Action                                                       |
| ------- | ------------------------------------------------------------ |
| ⌘K      | Command palette                                              |
| ⌘N      | New Playroom                                                 |
| ⌘R      | Refresh the current room list, room detail or playhouse list |
| ⌘,      | Settings                                                     |
| ⌘1 / ⌘2 | Playrooms / Playhouses                                       |
| ⌘F      | Focus the current screen's search, where available           |
| ?       | Keyboard shortcut overview                                   |
| c / /   | New Playroom / search on Playrooms only                      |

The desktop menu supplies About, Settings and Quit; File → New Playroom;
View → Refresh, Focus Search and Theme (Light, Dark, System); Go → Playrooms,
Playhouses and Defaults; the standard Edit and Window menus; and Help → Keyboard
Shortcuts, Documentation and Report an issue. Native app actions emit events to
the same frontend dispatcher as keyboard shortcuts. About, Quit, Edit and Window
use native Wails roles. Refresh has a native ⌘R accelerator instead of the reload
role. Its WebKit precedence needs verification in the desktop build.

Routes declare screen titles. `WindowTitleStrategy` sets both the document and
native title through `wailsApi`: `demo — Playrooms` for a room,
`Playrooms — demo` for a selected playhouse's list, and the screen name elsewhere.
It also updates the list title when the playhouse changes without navigation.
The dummy API sets `document.title` and opens Help links in a browser tab.

## Evening stop and idle reminders

Settings → Evening stop saves a device-local schedule (off by default, 22:00
on weekdays) and idle reminder threshold (4 hours). Only your own Ready rooms
in the current playhouse are considered, while the app runs and the Mac is
awake. Times use the Mac's local timezone. Keep running on room details skips
automatic evening stops for that room on this Mac; idle reminders still apply.

Ten minutes before the stop, a desktop notification and an in-app reminder name
the rooms and actual stop time (including snooze). A top-right notice overlays
the page without shifting its header, separate from bottom-right task toasts. Both offer
**Snooze 1 hour** and **Keep running tonight**. A missed deadline after sleep
asks **Evening stop was missed**, with **Stop**, instead of catching up. Native
notification actions are checked in Go even when the webview reloads. An in-app
Stop waits for the command and refreshes the current selection through the room
lifecycle service, so its signal-backed room list redraws immediately. Reminders
are available in the app when macOS notification permission is denied; task
completion notification preferences do not suppress these explicit reminders.

An idle reminder counts from the first running observation in this app session,
or the latest successful Connect/Open handoff. It says **No connection from this
app for 4 hours**; outside connections and actual SSH activity are unknown.
Restarting the app starts a fresh observation period. A new connection allows
another reminder; an unchanged idle period reminds once. Settings and per-room
opt-outs persist; snooze, tonight's exemption and observations are session-only.

Dummy preview uses simulated stops and localStorage preferences. Add
`?schedule=fast` to start a Monday clock at 21:49, one minute per second;
`?schedule=idle` advances an hour per second; `?schedule=missed` advances two hours
per second. Enable the schedule before its deadline to try warning and missed
stop actions. Enabling the fast preview resets its clock to 21:49. Editor opens
are simulated successfully only in these explicit scheduling previews; the normal
dummy editor-open failure still offers the health check. No native notification
or real acloud command runs in these modes.

### Command palette

⌘K opens `shared/components/command-palette/`. It searches screen and action
labels, rooms in the current playhouse, and a fresh playhouse list. It loads
the room list through the lifecycle service if the selection has not loaded yet.
Case-insensitive subsequences match; recently used matches come first, then
contiguous matches before scattered letters. Recent items stay in memory for the
session (up to twenty); scope and playhouse are part of room identities.

Arrow keys wrap the selection, Enter runs it, and Escape dismisses the palette.
The search combobox exposes its active listbox option to assistive technology.
Actions wait until the palette has closed and restored focus. Screen, create,
refresh and theme actions use the shortcut/menu dispatcher; room actions use the
same connect/open dialog and lifecycle service as room cards, with the same
status and pending-operation guards. Direct playhouse choices select and navigate
like the chooser; Switch playhouse opens that existing chooser. Responses from
closed palettes are ignored and failed playhouse reads are shown inline.

The shared Connect/Open dialog handles Escape from its own controls, including
when opened by the palette. A select that consumes Escape keeps the dialog open.

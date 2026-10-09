# The backend

The Go in `backend/`. It turns what a user filled in on a screen into an
`acloud` command line, runs it, and reports what happened.

[`ARCHITECTURE.md`](ARCHITECTURE.md) is the rulebook — what the GUI is and is
not allowed to do, and why. This is the code tour: what lives in each package,
what the important types do, and how to add to it.

## Contents

- [Shape of the package](#shape-of-the-package) — the tree, and the one import rule
- [`cli` — the engine](#cli--the-engine) — arguments, execution, output, errors, redaction
- [Command packages](#command-packages) — `playroom`, `playhouse`, and the file shape
- [`config` — pickers without fzf](#config--pickers-without-fzf)
- [`terminal` and `auth` — the hand-off](#terminal-and-auth--the-hand-off)
- [`local` — the documented exceptions](#local--the-documented-exceptions)
- [Tests](#tests) — what each layer proves
- [Naming](#naming) — the house rule, and how Go differs
- [Adding a command](#adding-a-command) — end to end

## Shape of the package

```
backend/
  cli/          runs commands, streams output, cancels; knows no specific command
    clitest/    test support shared by the command packages
  playroom/     one file per command: input struct + argument builder + entry point
  playhouse/    same
  config/       context and organisation switching
  auth/         acloud auth login (hand-off) and logout
  terminal/     hand-off to the user's terminal for the interactive commands
  local/        the documented exceptions: direct reads with no CLI equivalent
```

Two import rules hold the whole thing together:

**`cli` never imports a command package.** It knows how to run a set of
arguments, not what any of them mean. That is what keeps it testable against a
fake binary, and what stops command-specific behaviour leaking into the runner.

**`backend` never imports Wails and never executes the root Cobra tree.**
Backend packages build and test headless. `main/` owns application wiring;
this module has no dependency on the private CLI source. The UI event sink is injected
through `Emitter`, keeping command execution independent of the toolkit.

## `cli` — the engine

### Building arguments

`CommandArguments` (in `arguments.go`) is how every command serializes its input. It exists so
the rule that matters is written once instead of copy-pasted into a dozen
builders: **a flag is forwarded only when the GUI actually set it**, so the
command applies its own default — including anything the user configured with
`playroom config`.

| Method                  | Emits                                  | Use for                                                                                                                                    |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Positional(v)`         | `v`, even when blank                   | required positionals — dropping a blank one shifts every later argument into the wrong slot, so it goes through and the command rejects it |
| `OptionalPositional(v)` | `v` when non-blank                     | positionals with a command-side default                                                                                                    |
| `Str(flag, v)`          | `--flag v` when non-blank              | ordinary string flags                                                                                                                      |
| `Repeat(flag, vs)`      | one `--flag v` per non-blank value     | `--env`, `--git`, `--copy`, `--port`                                                                                                       |
| `Int(flag, n)`          | `--flag n` when `n > 0`                | counts; zero means "not set"                                                                                                               |
| `Flag(flag, b)`         | bare `--flag` when true                | presence-only booleans: `--ephemeral`, `--no-wait`, `--force`                                                                              |
| `Explicit(flag, b)`     | `--flag=true` / `--flag=false`, always | booleans whose CLI default is true, or that the command reads through `flag.Changed`                                                       |
| `Add(v...)`             | verbatim                               | escape hatch — `--yes`, `-o json`, everything past `--`                                                                                    |

`Explicit` is the interesting one. Only `--read-only`, `--privileged` and
`--forward-agent` use it. All three can be defaulted to true through `playroom
config`, so a bare `--flag` cannot express "the user turned this off" and
omitting it cannot express "the user deliberately left it on". A definite toggle
in the UI has to send a definite value.

`CommandArguments` is pure serialization — no defaults, no validation, no behaviour. That is
what makes the argument tests straightforward.

### Running it

`Runner.Run(ctx, arguments, Options)` executes `acloud <arguments...>` and waits.

The binary is resolved by `binary.go` in the order listed in
[Architecture](ARCHITECTURE.md#running-commands) and cached per Runner until
`forgetResolvedBinary` clears it. `DescribeBinary` reports the outcome for the
settings screen; `SaveConfiguredBinary` checks a candidate with `acloud version`
before storing it, so an unusable path cannot be saved. Tests point the Runner
at a fake program with `WithExecutable`.

```go
type Options struct {
    OperationID string // stream output under this id, and make the run cancellable
    Stdin       string // pre-answer a prompt the command has no --yes for
}

type Result struct {
    Stdout   string
    Stderr   string
    ExitCode int
}
```

**`OperationID` is the switch between the two modes**, and the difference is not
cosmetic:

- **With an id**, each stream is scanned line by line and every line is emitted
  to the UI as it arrives. That is what makes the activity log live rather than
  a post-mortem dump, and it is what `Cancel(opID)` hooks into.
- **Without one**, the streams are copied wholesale. That is the path quick
  reads like `list -o json` take, and copying rather than line-splitting is what
  keeps their output byte-exact for the JSON decoder.

Polled reads pass no id on purpose. A room list refreshing every ten seconds
would bury everything worth reading.

### Cancellation

`Run` registers its cancel func under the `OperationID` while in flight.
`Cancel(operationID)` looks it up and calls it, reporting whether anything was
running.

Cancelling **interrupts before killing**: `cmd.Cancel` sends `os.Interrupt` and
`cmd.WaitDelay` gives the child five seconds to exit on its own. Playroom
commands clean up on interrupt — removing `known_hosts` entries, scaling node
pools back down — and killing outright would strand that work.

A cancelled command also exits non-zero. `outcomeOf` checks `ctx.Err()` first and
reports the cancellation, because that is the fact the caller acts on: the UI
shows "cancelled", not "failed".

### Output capture

`boundedBuffer` (in `output.go`) is a bounded, never-failing `io.Writer`. Two limits
matter:

- **4 MiB per stream.** It keeps the _head_, so captured JSON stays parseable.
  Writes past the ceiling are dropped rather than erroring — failing a command
  because of our own buffer limit would be worse than losing trailing output.
- **1 MiB per line** for the streaming scanner. bufio's 64 KiB default is too
  small for a one-line JSON listing. If a line exceeds even that, the reader
  keeps draining so the child never blocks writing into a full pipe.

### Errors

A non-zero exit becomes an `*ExitError` carrying the arguments, the exit code
and the CLI's own stderr.

`Error()` returns **everything from cobra's `Error: ` marker onwards**, with the
marker itself removed — the explanation and whatever the command printed after
it, in the order it was written. Failing that marker, the **last three non-blank
lines**, since cobra prints usage and progress first and the failure last. If
there is no usable stderr at all it falls back to `<command> exited with code N`.

Taking the message whole rather than as a blind tail is what lets the frontend
show it as a failure and, underneath, what to do about it: acloud writes most
errors as `<problem>; <remedy>` or as a failure followed by the command that is
safe to re-run, and a tail can start halfway through one of those — leaving a
remedy on screen with nothing explaining what it was for. `explainFailure` in
`frontend/src/app/shared/utils/cli-error.ts` is the other half.

The predecessor discarded all of this and surfaced a bare `exit status 1`.

### Events

```go
type Emitter func(Event)
```

`Event` has three types — `cli:started` (carries the command line), `cli:output`
(carries a stream and a line), `cli:done` (carries the exit code and any error).
The values double as the Wails event names the frontend subscribes to.

The emitter is an injected function, not a Wails call. That is the seam that
keeps this package headless: the runner is testable without a running
application, a CLI-only build never drags the GUI toolkit in, and `events.go`
supplies the real one at startup.

### Redaction

`playhouse create` takes a Tailscale OAuth secret on its command line, and the
GUI shows commands verbatim. Two mechanisms cover the two ways it could leak:

- **`redactArguments`** blanks the value of any flag whose _name_ contains `secret`,
  `token`, `password` or `passwd`. Matching is by substring, so a credential
  flag added to the CLI later is redacted by default instead of leaking until
  someone remembers this file.
- **`RedactText`** blanks any credential appearing verbatim in free text, given
  the arguments it was passed on. This one is needed because a command that
  _rejects_ a credential quotes it back: cobra's own parse failure is
  `invalid argument "…" for "--tailscale-oauth-client-secret" flag`. The secret
  reaches the user through stderr, not through the arguments. Very short values
  are skipped, since blanking a three-character string would corrupt unrelated
  text.

Both apply only to what is displayed — previews, the activity log, error
messages. `Run` always executes the real arguments.

### The guard

`rejectArgumentsTheGUIMustNeverRun` refuses two argument lists: an empty one,
and `playhouse interface` behind any of its aliases (`playhouse`, `playhouses`,
`ph`, `house`). The installed CLI may launch this app for that command, so executing it from
the GUI could open another window.

The aliases are maintained locally to avoid importing private CLI code.
Runner tests exercise the guard; there is no public test against the private
command tree.

### Previews

`Preview(arguments)` prepends `acloud` and redacts; `PreviewString` renders that
as one copy-pasteable line, quoting only arguments that need it. `Quote` is also
what the terminal hand-off uses to build the line it passes to the emulator,
where an unquoted path would be re-split by the shell.

The preview and the executed command come from one value, so they cannot
disagree. See [ARCHITECTURE.md](ARCHITECTURE.md#command-previews) for what
happened when they were two.

### Package-level helpers

`default.go` holds a package-level `Runner` behind `cli.Run`, `cli.Cancel`,
`cli.SetEmitter` and `cli.Executable`. Production uses those; tests construct
their own `Runner` with options.

## Command packages

`playroom` and `playhouse` are the same shape. One file per command, three
parts, no more:

```go
// 1. what the GUI collected
type DeleteInput struct {
    Name         string
    Playhouse    string
    Force        bool
    NoWait       bool
    WaitTimeout  string
    ForceInstall bool
}

// 2. a thin entry point
func Delete(ctx context.Context, operationID string, input DeleteInput) error {
    _, err := cli.Run(ctx, buildDeleteArguments(input), cli.Options{OperationID: operationID})
    return err
}

// 3. pure serialization
func buildDeleteArguments(input DeleteInput) []string {
    return cli.NewCommandArguments("playroom", "delete").Positional(input.Name).
        Str("--playhouse", input.Playhouse).
        Add("--yes").
        Str("--wait-timeout", input.WaitTimeout).
        Flag("--force", input.Force).
        Flag("--no-wait", input.NoWait).
        Flag("--force-install", input.ForceInstall).
        Build()
}
```

`--yes` is unconditional there because the GUI has already taken a typed
confirmation. Running the real command keeps the whole delete path intact —
`known_hosts` and ssh-config cleanup, idle node-pool scale-down, cache
clearing — none of which the GUI reimplements.

`lifecycle.go` groups delete, start and stop because they share a shape;
everything else gets its own file. `preview.go` in each package is one line per
command, wrapping the same builder the entry point uses.

Reads are the same shape with a decode on the end — `List` runs
`playroom list -o json` with no `OperationID` and unmarshals `Result.Stdout`.

## `config` — pickers without fzf

`config use-organisation` and `config use-context` look interactive, but fzf is
only how they obtain an argument when they have a terminal. Both accept the
value directly, and the picker is reached only when no argument was given _and_
stdout is a TTY.

So this package lists (`-o json`), and passes the choice as a positional. There
is nothing to embed and nothing to emulate — and a no-argument call in a
subprocess fails cleanly rather than hanging, because stdout is a pipe.

It is the worked example for every other fzf-backed command, should
`kubeconfig get/install` or `shell` ever be wanted.

## `terminal` and `auth` — the hand-off

`playroom connect` needs a real TTY and `auth login` waits on a browser
round-trip, so neither can stream into a pane.
`terminal.Open(emulator, arguments)` launches the identical command in
Terminal.app, iTerm or Ghostty.

Two details worth knowing:

**No AppleScript.** Driving a terminal with `tell application "iTerm"` needs
macOS Automation (TCC) permission, and until it is granted `osascript` blocks on
a consent dialog the GUI never shows — so the hand-off hung indefinitely instead
of failing. Terminal.app only appeared to work because that permission was
usually already granted. The command is written to a throwaway self-deleting
script and passed to `open -a`, which needs no permission and returns as soon as
the app has been asked to start. That is also what makes a missing emulator
surface as a real error.

**The command line prefers the bare name `acloud`**, so the user sees the
command they would have typed, and falls back to the absolute path of the
configured CLI binary when acloud is not on `PATH` — the normal case for someone who
only launches the GUI from Finder.

The emulator choice is a GUI concept and is never passed to acloud.
`TestTerminalChoiceIsNeverSentToTheCLI` asserts that.

## `local` — the documented exceptions

The only code here that does not go through a command. It is small on purpose,
and it lives in one package so the exceptions are easy to count.

|                    |                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `session.go`       | cached playhouse, current user's email, logged-in check, acloud version                      |
| `images.go`        | a small, locally maintained catalog of image aliases                                         |
| `tools.go`         | a `$PATH` probe for tailscale and ssh                                                        |
| `theme.go`         | the remembered theme — the one write                                                         |
| `compatibility.go` | the acloud release these screens were verified against, and whether the running one is newer |

The config helpers read the CLI's YAML file on each lookup; they do not import
private config packages or retain a startup snapshot. The version helper runs
`acloud version`, tool probes inspect `PATH`, and image aliases are maintained
locally as a convenience. Custom image references are also accepted.
Only the remembered GUI theme is written here.

The theme is written because the native window background must be chosen in Go
before any JavaScript runs; the frontend's localStorage copy is too late. It
deliberately does not live in `~/.acloud.yaml` — that file is the CLI's.

`compatibility.go` is the one entry that describes the GUI rather than acloud.
`VerifiedAgainstAcloudVersion` is a hand-maintained constant — the release whose
flags and defaults someone last checked the screens against — and
`DescribeAcloudCompatibility` reports whether the running acloud is newer than
it. It stays silent for an equal or older version and for any version it cannot
parse, so a development build never warns its own developer. Raise the constant
when you have re-checked the screens, not when the release number moves. The
reasoning is in [DECISIONS.md](DECISIONS.md).

The rule governing what is allowed in here is in
[ARCHITECTURE.md](ARCHITECTURE.md#what-may-bypass-the-cli). Read it before
adding anything.

## Tests

The tests cover the public GUI contract without importing the private CLI:

**`arguments_test.go`** (per command package) — table tests over the builders. A bare
input emits the minimum, a fully-populated one emits everything, blanks are
dropped. These are the fastest way to pin down what a command should send.

**CLI parity is not checked here.** The embedded prototype walked the private
Cobra tree, but those tests are not present after the public split. Verify
supported flags against the CLI when changing a command.

**`runner_test.go`** — drives a fake binary through `WithExecutable`, covering
exit codes, streaming, cancellation and the kill delay without needing a real
acloud.

**`clitest/`** retains the prototype's `AssertFlagParity` and `FindCommand`
helpers. No current test supplies the private command tree to them.

**`terminal_test.go`** — the hand-off, without opening a terminal. `handOff` is
a package-level variable holding the real launcher, swapped for a recorder so a
test can assert _what would have been opened_. Same seam as `WithExecutable` on
the runner, and as `ConfigReader`/`ConfigWriter` in the CLI's own config code.

**`local/session_test.go`** — the config lookups, against a temporary file. The
CLI honours `ACLOUDCONFIG`, so `t.Setenv` points it at a temp path and the
developer's real `~/.acloud.yaml` is never read or written.

### Nothing in the test suite creates anything

No test here runs acloud, reaches a cluster, or opens a window, and that is a
property of the design rather than a rule anyone has to remember. The GUI's job
is to _build a command_, and building one is a pure function — so the tests that
matter are assertions about arguments. `buildCreateArguments` returns a
`[]string` and runs nothing, which is why `arguments_test.go` can pin exactly what
`playroom create` would send without a playhouse existing anywhere.

Where something genuinely has to execute, it executes against a stand-in:

| what is under test   | how it avoids doing the real thing          |
| -------------------- | ------------------------------------------- |
| argument builders    | pure functions — nothing to avoid           |
| `Runner.Run`         | `WithExecutable` points it at a fake binary |
| `terminal.Open`      | `handOff` swapped for a recorder            |
| `local` config reads | `ACLOUDCONFIG` points at a temp file        |

If you find yourself needing a real playroom to test something, that is usually
the signal that behaviour has leaked out of the CLI and into the GUI — which is
the thing [ARCHITECTURE.md](ARCHITECTURE.md) exists to prevent.

The frontend has a matching test; see
[ARCHITECTURE.md](ARCHITECTURE.md#staying-in-step-with-the-cli) for how the two
halves fit together.

## Naming

The house rule — a function name is a short sentence about what the caller gets
— is written up in [FRONTEND.md](FRONTEND.md#naming), and it applies here too
with one adjustment: **Go names are judged at the call site.** `cli.Run`,
`playroom.Delete` and `local.CurrentUser` are already sentences because the
package qualifies them, and expanding them only stutters. It is the unexported
helpers, which have no package prefix, where the rule earns its keep —
`rejectArgumentsTheGUIMustNeverRun` rather than `validateArgs`,
`pathToOwnExecutable()` rather than `binary()`.

The shortcut for finding the name: the tests here are already written that way,
so name the function the way you named its test.

**Receivers are their type in lowerCamelCase.** `func (commandArguments
*CommandArguments) Positional(...)`, `func (runner *Runner) Run(...)`, `func
(app *App) ListPlayrooms(...)`. This is deliberately not Go's usual one-letter
convention: `a.arguments` tells a reader nothing that `commandArguments.arguments`
does not. The rule is mechanical, so there is nothing to decide per type — and
where the receiver would shadow its own type, the type is what gets renamed
(`capture` became `boundedBuffer`, `recorder` became `eventRecorder`).

**Parameters, locals and fields follow the same rule** — `data` not `p`,
`options` not `opts`, `mutex` not `mu`, `workingDirectory` not `wd`. What stays
short is the genuine idiom only: `ctx`, `err`, `ok`, `got`, `want`, and `i` as
a loop index.

The full rule, including its TypeScript half, is in
[FRONTEND.md](FRONTEND.md#the-same-rule-for-everything-else-you-name).

## Adding a command

1. New file in `playroom/` or `playhouse/`: the input struct, the entry point,
   the argument builder. Copy the shape above.
2. `Preview<Name>` in that package's `preview.go` — but only if the UI has a
   surface to show it on. Start and stop have none, so they have none.
3. A method on `App` in `app_playroom.go` or `app_playhouse.go`. Keep it a
   one-liner; behaviour belongs in the backend, and the backend defers to the
   CLI.
4. Regenerate bindings:
   `make build`.
5. Wire the UI, and give it a way in — a button, a menu entry, a route.
6. Table test in `arguments_test.go`, and verification against the supported CLI.
7. Account for every field in `input-coverage.spec.ts`.

Adding a _flag_ to an existing command is shorter; that checklist is in
[ARCHITECTURE.md](ARCHITECTURE.md#adding-a-cli-flag).

Step 5 is the one that is easy to skip and impossible for the tests to catch.
The Play dialog wired every field it had, passed everything, and shipped with no
button that opened it.

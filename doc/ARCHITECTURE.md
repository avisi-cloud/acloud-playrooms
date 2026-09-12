# Architecture

> Public split note: this document was copied from the embedded GUI prototype. The standalone app now shells out to the installed `acloud` binary instead of compiling private `acloud` packages into itself. Some detailed wording below still describes the old embedded design and should be rewritten as the public repo settles.


How the desktop GUI runs `acloud` commands, and the rules that keep it a
faithful mirror of the CLI rather than a second implementation of it.

Paths below are relative to `gui/` unless they begin with `cmd/` or `pkg/`,
which are repo-root.

## Contents

- [The contract](#the-contract) — the rule everything else follows
- [How commands run](#how-commands-run) — subprocess execution, output, cancellation
- [Package layout](#package-layout) — what lives where, and the import constraint
  (a fuller tour is in [BACKEND.md](BACKEND.md))
- [What may bypass the CLI](#what-may-bypass-the-cli) — the one narrow exception
- [Command previews](#command-previews) — why the frontend does not build them
- [Adding a CLI flag](#adding-a-cli-flag) — the checklist
- [Staying in step with the CLI](#staying-in-step-with-the-cli) — the tests that catch drift

## The contract

**The CLI owns all behaviour. The GUI builds the arguments and runs them.**

Every operation the GUI performs is a real invocation of the acloud binary with
the arguments a user would have typed. The GUI does not construct Kubernetes
objects, does not re-declare flag defaults, and does not decide what a command
means. It serializes a form into arguments and hands them over.

Concretely, each command is one file with three parts:

```go
type CreateInput struct { … }                       // what the GUI collected

func Create(ctx, opID, input) error {               // thin entry point
    _, err := cli.Run(ctx, buildCreateArguments(input), cli.Options{OpID: opID})
    return err
}

func buildCreateArguments(input CreateInput) []string {  // pure serialization
    return cli.NewCommandArguments("playroom", "create").Positional(input.Name).
        Str("--image", input.Image).
        …
        Build()
}
```

`buildXArguments` is a pure function with no defaults, no validation, and no
behaviour. That is what makes it testable, and what makes the parity test
possible.

### Unset fields are omitted

A blank string or a false toggle means *the GUI did not set this*, so the flag
is left off entirely and the command applies its own default. This matters more
than it looks: it is what lets a user's `playroom config` defaults take effect,
because the command resolves them itself.

Three flags break that rule deliberately — `--read-only`, `--privileged` and
`--forward-agent` are sent as `--flag=true|false`, always. All three can be
defaulted to true through `playroom config`, so presence alone cannot express
"the user turned this off", and the GUI renders each as a definite toggle. A
definite switch sends a definite value.

## How commands run

`backend/cli` executes the installed `acloud` binary as a child process.

That works because the GUI ships inside the acloud binary, so the executable is
the exact CLI the user would invoke by hand: same build, same flags, no PATH
lookup, no version skew. Running a real process buys three things:

- **Output.** The command's own stdout and stderr, line by line as it arrives.
  It goes to the activity log rather than onto the screen — see
  [`DECISIONS.md`](DECISIONS.md) for why it is quiet by default — and a failure
  opens that log at the command that failed.
- **Cancellation.** Each run gets an operation id; cancelling interrupts the
  child and kills it if it does not exit.
- **The command's full behaviour**, including the parent cobra hooks. This is
  not academic: the previous in-process approach executed *detached*
  subcommands, so `PlayroomCmd.PersistentPreRunE` never fired and every default
  a user set on the Defaults screen was silently ignored by the GUI.

Streaming is opt-in per call. Pass an `OpID` for anything a user starts and
waits on; leave it empty for reads like `list -o json`, which are polled every
few seconds and would otherwise flood the console. Without an `OpID` the output
is copied wholesale rather than line-split, keeping JSON byte-exact.

### Interactive commands

`playroom connect` and `auth login` need a real TTY, so they cannot stream into
a pane. Both are handed to the user's terminal by `backend/terminal`, running
the identical command line. macOS only for now — see
[`DECISIONS.md`](DECISIONS.md).

The terminal choice itself is a GUI concept and is never passed to acloud. A
test asserts that.

### Commands with an fzf picker

`config use-organisation` and `config use-context` are *not* in that category,
even though they look interactive. fzf is only how they obtain an argument when
they have a terminal: both accept the value directly, and the picker is reached
only when no argument was given and stdout is a TTY.

So the GUI renders the list and passes the choice. There is nothing to embed and
nothing to emulate — and a no-argument call in a subprocess fails cleanly rather
than hanging, because stdout is a pipe. `backend/config` is the worked example;
the same shape covers `kubeconfig get/install` and `shell`.

## Package layout

A map, not a tour — [BACKEND.md](BACKEND.md) walks through each package and the
types in it.

```
backend/
  cli/         runs commands, streams output, cancels; knows no specific command
  cli/clitest/ test support shared by the command packages
  local/       the documented exceptions: direct reads with no CLI equivalent
  terminal/    hand-off to the user's terminal for the interactive commands
  auth/        acloud auth login (hand-off) and logout
  playroom/    one file per command: input struct + argument builder + entry point
  playhouse/   same
```

`app.go`, `app_playroom.go` and `app_playhouse.go` are a thin facade exposing
backend functions to JavaScript, and `events.go` adapts runner events onto
Wails. That adapter exists so `cli` never imports Wails and stays testable
headless — which is also why `backend/` carries no `gui` build tag while every
Wails-facing file does.

**The CLI module never imports the GUI module.** `gui/main` imports both and
registers the real `playhouse interface` command in place of the CLI-only
placeholder. Native launch logic lives in `launcher/`. The root CLI entry point
and dependency graph are independent of this module.

The backend runs commands as subprocesses; it does not execute the root Cobra
tree in process. Parity tests may inspect command packages.

## What may bypass the CLI

Almost nothing, and the exceptions live together in `backend/local` so they are
easy to count. The dividing line is not read versus write — it is **what
exists** versus **how a known thing is doing right now**.

**Anything that changes state is a real command.** Create, delete, start, stop,
update, config writes, switching organisation or context. There is no fast path
for a mutation and no exception to argue about.

**Anything that establishes what exists is a real command too.** Which playrooms
are there, how each is configured, who owns it — that set is the CLI's answer,
and the GUI never assembles it another way. This is the part people are tempted
to optimise, and it is the part that must not move.

**Anything that only refreshes how a known thing is doing may take a cheaper
path.** Once the CLI has produced a row, a direct read may update the live
fields on it — the status an indicator is coloured from, whether a pod has gone
ready. Re-running `playroom list` every second to recolour a dot is too heavy to
be the only option, and that cost is the entire justification.

When it is not obvious, the test is:

> Could this call, on its own, make the GUI show a playroom that is not there,
> or hide one that is?

If yes, it is a listing, and it belongs behind the CLI.

Two conditions hold for every direct status refresh:

- **It calls the same `pkg` function the command calls** — the same code with
  the subprocess hop removed, never a second query written for the GUI. That is
  what makes it structurally unable to disagree about what a status means.
- **It never wins an argument.** The CLI's answer is the truth, and the next CLI
  read overwrites whatever the fast path put on screen.

Today `backend/local` holds the cached playhouse, the current user's email, the
image constants, the logged-in check, the acloud version, the version-
compatibility notice and the tailscale/ssh probe. Every one is a read — of a
constant, of the config file the CLI itself writes, or of `$PATH` — and all of
them are smaller than anything the rule above has to adjudicate.

The compatibility notice is the newest and the least like the others: it
compares the running acloud against a constant naming the release these screens
were last verified against, so the sidebar can warn that a control may be
missing. It reads no state at all beyond the version already there, and it is
the GUI describing *itself*, not describing acloud — see
[`DECISIONS.md`](DECISIONS.md).

The one write is the remembered theme, and it is not acloud state at all. The
native window background has to be chosen in Go before any JavaScript runs, so
the frontend's localStorage copy is too late; one line on disk fixes a navy
flash for light-mode users at startup. It deliberately does not live in
`~/.acloud.yaml` — that file is the CLI's, and a GUI appearance preference has
no business in it.

If the CLI grows a command covering any of these, move it out of
`backend/local`. That is the point of keeping them in one visible place.

## Command previews

The UI shows the command it is about to run, and that string is generated by Go
(`Preview*` functions) from the same arguments the runner will execute. The
frontend does not build command lines.

It used to — `shared/utils/command-builders.ts` rebuilt them in TypeScript — and
that copy had already drifted: it knew nothing about `--exposure` or
`--privileged`. A preview that can disagree with what runs is worse than no
preview.

The one deliberate difference is redaction. `cli.Preview` blanks the value of
any flag whose name contains `secret`, `token`, `password` or `passwd` — matched
by substring, so a credential flag added later is covered without anyone
remembering. That applies to previews, the activity log and error messages;
`Run` executes the real arguments. Without it, the Tailscale OAuth secret typed
into the playhouse form would be printed back on screen and land in the
clipboard.

There is a `Preview*` for every command that has a surface to show one on. Start
and stop have none — they fire from a card with no confirmation step — so they
have no preview either.

## Adding a CLI flag

This is the only checklist. If you find another one somewhere, it is stale.

1. Add the field to the input struct in `backend/playroom` or
   `backend/playhouse`.
2. Add one line to that command's `buildXArguments`.
3. Expose it from the matching `app_*.go` method if it is a new operation — an
   added field needs no facade change.
4. Regenerate bindings:
   `cd gui && wails3 generate bindings -f '-tags gui' -clean=true`.
5. Add the control to the relevant Angular screen. The frontend input types come
   from the generated bindings, so a missing field is a compile error.
6. Extend the table test in `arguments_test.go`.
7. Account for the field in the frontend's `input-coverage.spec.ts` — wire it to
   a control, or list it as unwired **with a reason**.
8. Run the checks in [`../README.md`](../README.md).

You do not need to touch a command-preview builder — there isn't one any more.

## Staying in step with the CLI

Two tests do this, from opposite ends. Neither checks behaviour; both check that
somebody owns each flag. That is precisely the thing that stops being true
quietly.

### The Go end: does the GUI cover the CLI?

`TestGUICoversEveryPlayroomFlag` and `TestGUICoversEveryPlayhouseFlag` walk the
real cobra command tree and fail when the GUI drifts, in both directions:

- the command accepts a flag the GUI never sends, or
- the GUI sends a flag the command does not accept.

The arguments they check come from the builders driven by a fully-populated input,
so it measures what the GUI can actually emit, not a hand-maintained list that
could drift in its own right. Deliberate omissions go in the test's `skip` map
**with a reason** — that map is the record of what the GUI consciously does not
expose.

Add a flag to a playroom command and these fail until someone either wires it up
or writes down why not. That is the mechanism keeping this document honest.

### The TypeScript end: does the UI cover the GUI?

The parity test stops at the Go boundary, and for a while that was enough to be
misleading. `--privileged`, `--exposure`, `--tunnel` and the privileged-node
flags were all covered by the argument builders, bound into JavaScript, and set by
no control anywhere in the UI. Every test was green.

`frontend/src/app/core/services/input-coverage.spec.ts` closes that gap from the
other end. It reads the generated input models — which come from the Go structs
— and requires every field to be either wired to a control or listed with a
reason, in the same spirit as the Go test's skip map.

Together they mean a flag cannot go missing quietly at either end: the CLI must
reach the argument builder, and the argument builder must reach a control.

### What they still cannot see

Neither test knows whether anything *opens* the control. The Play dialog wired
every one of its fifteen fields, passed both, and sat unreachable in a shipping
build because the button that opened it had been removed. Coverage is not
reachability. If you add a screen, add the way in at the same time.

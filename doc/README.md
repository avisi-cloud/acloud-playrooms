# Documentation

Four documents. They answer different questions, and it is worth knowing which
one you want before you start reading.

| | Answers | Read it when |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | **What are the rules?** How the GUI turns a form into an acloud command, what is allowed to skip the CLI, and the checklist for adding a flag. | You are wondering what you are and are not allowed to do. |
| [BACKEND.md](BACKEND.md) | **Where is the Go?** A tour of `backend/`: building arguments, the command runner, cancellation, redaction, and what each package holds. | You are working in `backend/`. |
| [FRONTEND.md](FRONTEND.md) | **Where is the UI?** Angular structure, routes, state, the activity log, design tokens. | You are changing a screen. |
| [DECISIONS.md](DECISIONS.md) | **Why is it like this?** The choices behind the architecture, each with the reasoning, and the questions still open. | You are about to change something that looks wrong, or you want to know whether it already was. |

ARCHITECTURE and BACKEND are a pair: the first is the contract, the second is
the code that implements it. If you only read one before touching Go, read
ARCHITECTURE — the constraints are the part that is expensive to get wrong.

## If you are new here

Read [`../README.md`](../README.md) first — it is short and it explains the one
idea the rest depends on: the GUI builds the command a user would type and runs
it, rather than reimplementing acloud.

Then ARCHITECTURE.md for the mechanism, and BACKEND.md or FRONTEND.md for
whichever half you are about to touch.

## Before you change a rule

Several entries in DECISIONS.md exist because something was tried and did not
work — a status poll that spawned a subprocess per second, a preview rebuilt in
TypeScript that drifted from the command it claimed to show, a GUI that ignored
the user's own configured defaults and said nothing.

If a constraint looks unnecessary, check there first. If it is not written down,
it is fair game — and once you have decided, write it down here.

## Keeping these honest

Documentation drifts. Three things here resist it, and none of them are prose:

- The **parity tests** walk the real cobra tree, so a flag added to the CLI
  fails the build until the GUI covers it or records why not.
- **`input-coverage.spec.ts`** reads the generated input models, so a field that
  reaches JavaScript and no control fails too.
- The **command previews** are generated from the same arguments that run, so what
  the UI shows cannot disagree with what happens.

What none of them can check is whether a screen is reachable. See the end of
ARCHITECTURE.md.

And none of them runs in CI. That is the largest open item in DECISIONS.md:
every guard above currently fails only for someone who remembered to run it.
Until that changes, `npm run check` and `go test -tags gui ./...` before a merge
are the whole mechanism.

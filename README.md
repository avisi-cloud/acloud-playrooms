# Acloud Playrooms

Acloud Playrooms is a desktop interface for creating, managing and connecting to AI playrooms on Acloud. It gives users a visual flow for the same playhouse and playroom actions that are available in the `acloud` CLI, while the private `acloud` CLI remains the source of truth for platform behaviour.

The app is built with Wails 3 and Angular. It is intended to live as a small public companion project around the private Acloud CLI.

![Playrooms overview](assets/images/playrooms.png)

![Playhouse selection](assets/images/playhouse.png)

## What it does

Acloud Playrooms helps users:

- select a playhouse
- create a playroom with an AI coding image such as Codex, Claude Code or OpenCode
- view existing playrooms
- open, connect to, update and delete playrooms
- inspect the CLI commands the app is about to run
- follow command output in the activity log

The GUI is deliberately thin. It turns user actions into `acloud` commands, runs those commands locally, streams output into the app and reads JSON responses where the UI needs structured data.

Example commands the app may run:

```sh
acloud playhouse list -o json
acloud playroom create demo --playhouse playhouse-demo --image opencode
acloud playroom connect demo --playhouse playhouse-demo
```

## Requirements

Acloud Playrooms requires the `acloud` CLI to be installed and authenticated on the user’s machine. The GUI does not replace the CLI; it sits on top of it.

On macOS, install the CLI with Homebrew:

```sh
brew tap avisi-cloud/tools
brew install --cask avisi-cloud/tools/acloud
```

Then confirm the CLI works:

```sh
acloud version
acloud auth status
```

## Installing Acloud Playrooms

For the demo phase, the simplest distribution path is a GitHub Release:

```text
https://github.com/avisi-cloud/acloud-playrooms/releases
```

Users can download the macOS app archive, move `Acloud Playrooms.app` to Applications and open it.

A Homebrew cask can be added later for a cleaner install, upgrade and uninstall flow:

```sh
brew install --cask avisi-cloud/tools/acloud-playrooms
```

Homebrew is convenient, but it is not required for the app to work. A direct GitHub Release download is enough as long as the user also has the private `acloud` CLI installed.

## Running from source

For development against the `acloud` binary on your `PATH`:

```sh
make dev
```

For development against a sibling local `acloud` checkout built at `../acloud/bin/acloud`:

```sh
make dev-local
```

`make dev-local` passes the CLI path to the app as an absolute path, because macOS launches the `.app` bundle from a different working directory.

If your local `acloud` checkout lives somewhere else, copy `.env.example` to `.env.local` and set your path there:

```sh
cp .env.example .env.local
# edit LOCAL_ACLOUD in .env.local
```

You can also point at any other local CLI build for a single run with:

```sh
make dev-local LOCAL_ACLOUD=<your-path-to-acloud>/bin/acloud
```

The app also honors `ACLOUD_BINARY` directly:

```sh
ACLOUD_BINARY=<your-path-to-acloud>/bin/acloud make dev
```

For a local production build:

```sh
make build
```

The build writes:

```text
bin/acloud-playrooms
bin/Acloud Playrooms.app
```

## Checks

Run the backend and frontend tests with:

```sh
make test
cd frontend && npm run check
```

If `frontend/dist` is missing, run `cd frontend && npm run build` first, or use `make build`, which generates bindings, builds the frontend and compiles the desktop app.

## Public/private boundary

This repository may contain:

- UI code and Wails backend code
- command argument builders
- JSON DTOs matching `acloud -o json` output
- subprocess execution and terminal hand-off logic
- demo-phase compatibility checks and small convenience lists

This repository should not contain:

- imports from the private `acloud` module
- direct Acloud API or Kubernetes behaviour copied from the CLI
- private implementation details that belong in `acloud`
- secrets, credentials or private release tokens

When the GUI needs data, prefer an existing `acloud ... -o json` command. If the CLI does not expose the data yet, either keep a small GUI-side convenience list for the demo phase or add a narrow JSON command to private `acloud` later.

## Relationship with `acloud playhouse interface`

The private `acloud` CLI can keep the entry point:

```sh
acloud playhouse interface
```

That command should launch the installed Acloud Playrooms app when it is available. If the app is missing, the CLI can print install instructions instead of embedding the GUI directly.

This keeps the public GUI easy to remove or replace later, while preserving a simple command for users who discover the feature through `acloud`.

# Documentation

Start with the [project README](../README.md) for what the app does, installation,
and the development quick start.

| I need to understand...                      | Read                               |
| -------------------------------------------- | ---------------------------------- |
| The rules between the app and the CLI        | [Architecture](ARCHITECTURE.md)    |
| Go packages, commands and cancellation       | [Backend](BACKEND.md)              |
| Angular screens, state and styling           | [Frontend](FRONTEND.md)            |
| Why earlier choices were made                | [Decisions](DECISIONS.md)          |
| GitHub setup, releases, Homebrew and signing | [Releasing](RELEASING.md)          |
| Local checks and pull request conventions    | [Contributing](../CONTRIBUTING.md) |

## What runs in GitHub

Every pull request runs Go formatting, frontend formatting and linting, frontend
tests and a production build, Go vet and race tests, and a complete macOS release
rehearsal. Generated bindings must match the committed files.

These checks need only this public repository. They do not import the private
`acloud` module or contact a live Acloud environment.

## What the checks cannot prove

Argument tests verify what this app sends. `input-coverage.spec.ts` accounts for
the fields exposed to the UI. Neither proves that a control is reachable or
that a newer CLI still accepts the same contract.

The old embedded prototype could inspect the private CLI's Cobra command tree.
Those parity tests are not part of this standalone repository. Some historical
entries in [Decisions](DECISIONS.md) describe that older arrangement.

Keep the documented CLI compatibility version in step with manual verification,
and check the user journey when adding a screen.

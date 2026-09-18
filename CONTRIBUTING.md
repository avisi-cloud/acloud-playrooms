# Contributing

Start with the [README](README.md) for the product and
[architecture](doc/ARCHITECTURE.md) for the implementation.

## Local setup

Use macOS, Xcode Command Line Tools (`xcode-select --install`), the Go toolchain
in `go.mod`, and Node.js from `.nvmrc`. With nvm installed:

```sh
nvm install
npm --prefix frontend ci
make build
make check
```

`make build` installs the matching Wails CLI, generates the JavaScript bindings,
builds Angular, and packages the native application. `make dev` starts live
development. See the README for using a local `acloud` checkout.

The tests use fake commands and temporary configuration. They do not need an
Acloud account, access to the private CLI source, or a running cluster.

## Before opening a pull request

```sh
make fmt
npm --prefix frontend run format
npm --prefix frontend run format:repo
make check
```

Commit regenerated `frontend/bindings/` whenever exported Go inputs or methods
change. Do not edit generated bindings by hand. `make build` regenerates them;
GitHub checks that the generated output agrees with what was committed.

For packaging changes, also run `make release-snapshot` on macOS with
[GoReleaser v2](https://goreleaser.com/install/) installed. This builds and checks
the actual download archive without uploading anything.

## Pull request titles

Use a Conventional Commit title and squash-merge. Release Please reads the
resulting commit to prepare the next version and changelog:

| Title                                              | Meaning                |
| -------------------------------------------------- | ---------------------- |
| `fix: show failed connections in the activity log` | A bug fix              |
| `feat: add a playroom filter`                      | A new feature          |
| `feat!: change the supported CLI contract`         | A breaking change      |
| `docs: clarify installation`                       | Documentation only     |
| `chore(deps): update Angular`                      | Dependency maintenance |

While the app is below 1.0, features and fixes bump the patch version; breaking
changes bump the minor version. Documentation-only and maintenance commits do
not trigger a release by themselves.

## Keep the GUI thin

- Build and execute real `acloud` commands; platform behaviour belongs in the CLI.
- Generate command previews from the same Go arguments that execute.
- Keep credentials out of previews, logs, fixtures, and screenshots.
- Add argument tests and a reachable UI control when exposing a new flag.
- Keep imports independent of the private `acloud` module.

Frontend formatting uses Prettier; linting uses ESLint and angular-eslint.
Existing accessibility warnings are documented in [FRONTEND.md](doc/FRONTEND.md).
They are a backlog, not suppressed errors.

## License

Contributions are provided under the repository's [Apache-2.0 license](LICENSE).
Copyright and attribution notices must be preserved as required by that license.

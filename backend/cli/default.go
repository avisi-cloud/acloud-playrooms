package cli

import "context"

// defaultRunner is the Runner the command packages use. One process, one
// runner: it owns the in-flight operation registry that Cancel works against.
var defaultRunner = New()

// SetEmitter wires the UI event sink into the default runner. gui calls
// this once at startup, before any command can run.
func SetEmitter(emitter Emitter) { defaultRunner.SetEmitter(emitter) }

// Run executes `acloud <arguments...>` through the default runner.
func Run(ctx context.Context, arguments []string, options Options) (Result, error) {
	return defaultRunner.Run(ctx, arguments, options)
}

// Cancel stops the in-flight operation with this id, reporting whether one was
// running.
func Cancel(operationID string) bool { return defaultRunner.Cancel(operationID) }

// Executable returns the acloud binary the runner uses. The terminal hand-off
// needs it for the commands that require a real TTY.
func Executable() (string, error) { return defaultRunner.pathToOwnExecutable() }

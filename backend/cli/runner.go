// Package cli runs acloud commands the way a user would type them, by
// executing the installed acloud binary as a child process.
package cli

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// defaultKillDelay is the grace period a cancelled command gets to clean up
// after being interrupted, before it is killed outright.
const (
	defaultKillDelay = 5 * time.Second
	acloudBinaryEnv  = "ACLOUD_BINARY"
)

// Runner executes acloud commands through the installed acloud binary.
type Runner struct {
	// override replaces the binary to execute. Only tests set it.
	override string

	resolveOnce sync.Once
	resolved    string
	resolveErr  error

	emitMutex sync.RWMutex
	emitter   Emitter

	killDelay time.Duration

	inflightMutex sync.Mutex
	inflight      map[string]context.CancelFunc
}

// Option configures a Runner.
type Option func(*Runner)

// WithExecutable overrides the acloud binary. Tests use it to point at a fake;
// production resolves acloud from PATH.
func WithExecutable(path string) Option {
	return func(runner *Runner) { runner.override = path }
}

// WithEmitter sets the sink for streaming events.
func WithEmitter(emitter Emitter) Option {
	return func(runner *Runner) { runner.emitter = emitter }
}

// WithKillDelay overrides how long a cancelled command may take to exit.
func WithKillDelay(killDelay time.Duration) Option {
	return func(runner *Runner) { runner.killDelay = killDelay }
}

// New builds a Runner.
func New(options ...Option) *Runner {
	runner := &Runner{
		killDelay: defaultKillDelay,
		inflight:  make(map[string]context.CancelFunc),
	}
	for _, option := range options {
		option(runner)
	}
	return runner
}

// Options tunes a single command run.
type Options struct {
	// OperationID, when set, streams output to the UI under this id and makes the run
	// cancellable. Leave it empty for quick reads such as `list -o json`.
	OperationID string

	// Stdin pre-answers confirmation prompts on commands with no --yes flag.
	Stdin string
}

// Result is what a finished command produced.
type Result struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// Run executes `acloud <arguments...>` and waits for it to finish. A non-zero
// exit becomes an *ExitError; a cancelled run wraps context.Canceled.
func (runner *Runner) Run(ctx context.Context, arguments []string, options Options) (Result, error) {
	if err := rejectArgumentsTheGUIMustNeverRun(arguments); err != nil {
		return Result{}, err
	}
	binary, err := runner.pathToOwnExecutable()
	if err != nil {
		return Result{}, err
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	if options.OperationID != "" {
		runner.register(options.OperationID, cancel)
		defer runner.unregister(options.OperationID)
	}

	cmd := exec.CommandContext(ctx, binary, arguments...)
	// Interrupt before killing so the command can run its cleanup.
	cmd.Cancel = func() error { return cmd.Process.Signal(os.Interrupt) }
	cmd.WaitDelay = runner.killDelay
	if options.Stdin != "" {
		cmd.Stdin = strings.NewReader(options.Stdin)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return Result{}, fmt.Errorf("capture stdout of %s: %w", PreviewString(arguments), err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return Result{}, fmt.Errorf("capture stderr of %s: %w", PreviewString(arguments), err)
	}

	if err := cmd.Start(); err != nil {
		return Result{}, fmt.Errorf("start %s: %w", PreviewString(arguments), err)
	}
	runner.emit(Event{Type: EventStarted, OperationID: options.OperationID, Command: Preview(arguments)})

	// Extracted once: every streamed line is checked against these.
	secrets := sensitiveValues(arguments)

	var stdoutCapture, stderrCapture boundedBuffer
	var streams sync.WaitGroup
	streams.Add(2)
	go func() {
		defer streams.Done()
		runner.consume(stdout, StreamStdout, options.OperationID, secrets, &stdoutCapture)
	}()
	go func() {
		defer streams.Done()
		runner.consume(stderr, StreamStderr, options.OperationID, secrets, &stderrCapture)
	}()
	// Both pipes must be drained before Wait closes them.
	streams.Wait()

	waitErr := cmd.Wait()
	result := Result{Stdout: stdoutCapture.String(), Stderr: stderrCapture.String(), ExitCode: exitCode(waitErr)}

	runErr := runner.outcomeOf(ctx, arguments, result, waitErr)
	runner.emit(doneEvent(options.OperationID, result.ExitCode, runErr))
	return result, runErr
}

// outcomeOf turns the raw wait error into the error callers should see:
// nothing at all, a cancellation, or the command's own failure.
func (runner *Runner) outcomeOf(ctx context.Context, arguments []string, result Result, waitErr error) error {
	if waitErr == nil {
		return nil
	}
	// A cancelled command also exits non-zero; report the cancellation, since
	// that is the fact the caller acts on.
	if ctxErr := ctx.Err(); ctxErr != nil {
		return fmt.Errorf("%s was cancelled: %w", PreviewString(arguments), ctxErr)
	}
	return &ExitError{Arguments: arguments, ExitCode: result.ExitCode, Stderr: result.Stderr}
}

func doneEvent(operationID string, code int, err error) Event {
	event := Event{Type: EventDone, OperationID: operationID, ExitCode: code}
	if err != nil {
		event.Error = err.Error()
	}
	return event
}

// Cancel stops the in-flight operation with this id, reporting whether one was
// running.
func (runner *Runner) Cancel(operationID string) bool {
	runner.inflightMutex.Lock()
	defer runner.inflightMutex.Unlock()
	cancel, ok := runner.inflight[operationID]
	if ok {
		cancel()
	}
	return ok
}

// SetEmitter wires the UI event sink in. gui calls it once at startup.
func (runner *Runner) SetEmitter(emitter Emitter) {
	runner.emitMutex.Lock()
	defer runner.emitMutex.Unlock()
	runner.emitter = emitter
}

func (runner *Runner) emit(event Event) {
	runner.emitMutex.RLock()
	emitter := runner.emitter
	runner.emitMutex.RUnlock()
	// No emitter is normal: quick reads pass no OperationID, and tests run headless.
	if emitter == nil || event.OperationID == "" {
		return
	}
	emitter(event)
}

func (runner *Runner) register(operationID string, cancel context.CancelFunc) {
	runner.inflightMutex.Lock()
	defer runner.inflightMutex.Unlock()
	runner.inflight[operationID] = cancel
}

func (runner *Runner) unregister(operationID string) {
	runner.inflightMutex.Lock()
	defer runner.inflightMutex.Unlock()
	delete(runner.inflight, operationID)
}

// pathToOwnExecutable resolves the installed acloud binary once per Runner.
func (runner *Runner) pathToOwnExecutable() (string, error) {
	if runner.override != "" {
		return runner.override, nil
	}
	runner.resolveOnce.Do(func() {
		if configured := strings.TrimSpace(os.Getenv(acloudBinaryEnv)); configured != "" {
			runner.resolved = configured
			return
		}
		path, err := exec.LookPath("acloud")
		if err != nil {
			runner.resolveErr = fmt.Errorf("locate acloud on PATH or set %s: %w", acloudBinaryEnv, err)
			return
		}
		runner.resolved = path
	})
	return runner.resolved, runner.resolveErr
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return exit.ExitCode()
	}
	return -1
}

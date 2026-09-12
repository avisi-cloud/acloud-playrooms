package cli

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// The runner re-executes the acloud binary, so these tests re-execute the test
// binary instead: with this set, TestMain behaves like a command.
const fakeScriptEnv = "ACLOUD_CLI_RUNNER_FAKE"

func TestMain(m *testing.M) {
	if script := os.Getenv(fakeScriptEnv); script != "" {
		runFakeCommand(script)
		return
	}
	os.Exit(m.Run())
}

func runFakeCommand(script string) {
	switch script {
	case "ok":
		fmt.Fprintln(os.Stdout, "resolved playhouse")
		fmt.Fprintln(os.Stderr, "a warning")
		fmt.Fprintln(os.Stdout, "done")
		os.Exit(0)
	case "json":
		fmt.Fprint(os.Stdout, `[{"Name":"demo"}]`)
		os.Exit(0)
	case "fail":
		fmt.Fprintln(os.Stderr, "resolving playhouse")
		fmt.Fprintln(os.Stderr, `Error: playhouse "nope" not found`)
		os.Exit(3)
	case "silent-fail":
		os.Exit(4)
	case "sleep":
		time.Sleep(30 * time.Second)
		os.Exit(0)
	case "stdin":
		data, _ := io.ReadAll(os.Stdin)
		fmt.Fprintf(os.Stdout, "answered:%s", strings.TrimSpace(string(data)))
		os.Exit(0)
	}
	fmt.Fprintf(os.Stderr, "unknown fake script %q\n", script)
	os.Exit(99)
}

// fakeRunner returns a Runner that re-executes this test binary running the
// named script.
func fakeRunner(t *testing.T, script string, options ...Option) *Runner {
	t.Helper()
	t.Setenv(fakeScriptEnv, script)
	return New(append([]Option{WithExecutable(os.Args[0])}, options...)...)
}

type eventRecorder struct {
	mutex  sync.Mutex
	events []Event
}

func (eventRecorder *eventRecorder) emit(event Event) {
	eventRecorder.mutex.Lock()
	defer eventRecorder.mutex.Unlock()
	eventRecorder.events = append(eventRecorder.events, event)
}

func (eventRecorder *eventRecorder) snapshot() []Event {
	eventRecorder.mutex.Lock()
	defer eventRecorder.mutex.Unlock()
	return append([]Event(nil), eventRecorder.events...)
}

func eventually(t *testing.T, check func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if check() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}

func TestExecutableCanComeFromEnvironment(t *testing.T) {
	t.Setenv(acloudBinaryEnv, "/tmp/dev-acloud")

	got, err := New().pathToOwnExecutable()
	if err != nil {
		t.Fatalf("pathToOwnExecutable() error = %v, want nil", err)
	}
	if got != "/tmp/dev-acloud" {
		t.Fatalf("pathToOwnExecutable() = %q, want env value", got)
	}
}

func TestExecutableOverrideWinsOverEnvironment(t *testing.T) {
	t.Setenv(acloudBinaryEnv, "/tmp/dev-acloud")

	got, err := New(WithExecutable("/tmp/test-acloud")).pathToOwnExecutable()
	if err != nil {
		t.Fatalf("pathToOwnExecutable() error = %v, want nil", err)
	}
	if got != "/tmp/test-acloud" {
		t.Fatalf("pathToOwnExecutable() = %q, want override value", got)
	}
}

func TestRunCapturesOutputAndSucceeds(t *testing.T) {
	runner := fakeRunner(t, "ok")

	result, err := runner.Run(context.Background(), []string{"playroom", "list"}, Options{})
	if err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}
	if result.ExitCode != 0 {
		t.Errorf("ExitCode = %d, want 0", result.ExitCode)
	}
	if !strings.Contains(result.Stdout, "resolved playhouse") || !strings.Contains(result.Stdout, "done") {
		t.Errorf("Stdout = %q, want both stdout lines", result.Stdout)
	}
	if !strings.Contains(result.Stderr, "a warning") {
		t.Errorf("Stderr = %q, want the warning", result.Stderr)
	}
}

// Quick reads must not be line-split and rejoined, or a JSON body could come
// back subtly altered before it reaches the decoder.
func TestRunWithoutOpIDKeepsStdoutByteExact(t *testing.T) {
	runner := fakeRunner(t, "json")

	result, err := runner.Run(context.Background(), []string{"playroom", "list", "-o", "json"}, Options{})
	if err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}
	if want := `[{"Name":"demo"}]`; result.Stdout != want {
		t.Errorf("Stdout = %q, want %q", result.Stdout, want)
	}
}

func TestRunStreamsEachLineWhenOpIDSet(t *testing.T) {
	events := &eventRecorder{}
	runner := fakeRunner(t, "ok", WithEmitter(events.emit))

	if _, err := runner.Run(context.Background(), []string{"playroom", "create", "demo"}, Options{OperationID: "op-1"}); err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}

	var started, done int
	lines := map[Stream][]string{}
	for _, event := range events.snapshot() {
		if event.OperationID != "op-1" {
			t.Errorf("event %v carries OperationID %q, want op-1", event.Type, event.OperationID)
		}
		switch event.Type {
		case EventStarted:
			started++
			if got := strings.Join(event.Command, " "); got != "acloud playroom create demo" {
				t.Errorf("started Command = %q, want the full command line", got)
			}
		case EventOutput:
			lines[event.Stream] = append(lines[event.Stream], event.Line)
		case EventDone:
			done++
			if event.ExitCode != 0 {
				t.Errorf("done ExitCode = %d, want 0", event.ExitCode)
			}
		}
	}

	if started != 1 || done != 1 {
		t.Errorf("started = %d, done = %d, want exactly one of each", started, done)
	}
	if got := lines[StreamStdout]; len(got) != 2 || got[0] != "resolved playhouse" || got[1] != "done" {
		t.Errorf("stdout lines = %q, want the two stdout lines in order", got)
	}
	if got := lines[StreamStderr]; len(got) != 1 || got[0] != "a warning" {
		t.Errorf("stderr lines = %q, want the single warning", got)
	}
}

// Without an OperationID there is no console pane listening, so emitting would be
// pointless work — and would let a quick poll spam the UI.
func TestRunWithoutOpIDEmitsNothing(t *testing.T) {
	events := &eventRecorder{}
	runner := fakeRunner(t, "ok", WithEmitter(events.emit))

	if _, err := runner.Run(context.Background(), []string{"playroom", "list"}, Options{}); err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}
	if got := events.snapshot(); len(got) != 0 {
		t.Errorf("emitted %d events, want none", len(got))
	}
}

func TestRunReturnsExitErrorCarryingStderr(t *testing.T) {
	runner := fakeRunner(t, "fail")

	result, err := runner.Run(context.Background(), []string{"playroom", "create", "demo"}, Options{})
	if err == nil {
		t.Fatal("Run() error = nil, want an ExitError")
	}

	var exitErr *ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("Run() error = %T, want *ExitError", err)
	}
	if exitErr.ExitCode != 3 || result.ExitCode != 3 {
		t.Errorf("ExitCode = %d (result %d), want 3", exitErr.ExitCode, result.ExitCode)
	}
	// The CLI's own explanation must survive, with cobra's prefix stripped.
	if want := `playhouse "nope" not found`; !strings.Contains(err.Error(), want) {
		t.Errorf("error = %q, want it to contain %q", err.Error(), want)
	}
	if strings.Contains(err.Error(), "Error: ") {
		t.Errorf("error = %q, should not repeat cobra's \"Error: \" prefix", err.Error())
	}
}

// A command can fail without saying anything; the message must still identify
// what ran rather than being empty.
func TestExitErrorFallsBackToTheCommandLine(t *testing.T) {
	runner := fakeRunner(t, "silent-fail")

	_, err := runner.Run(context.Background(), []string{"playroom", "stop", "demo"}, Options{})
	if err == nil {
		t.Fatal("Run() error = nil, want an ExitError")
	}
	if want := "acloud playroom stop demo exited with code 4"; err.Error() != want {
		t.Errorf("error = %q, want %q", err.Error(), want)
	}
}

func TestCancelStopsARunningCommand(t *testing.T) {
	runner := fakeRunner(t, "sleep", WithKillDelay(time.Second))

	errs := make(chan error, 1)
	go func() {
		_, err := runner.Run(context.Background(), []string{"playroom", "create", "demo"}, Options{OperationID: "op-cancel"})
		errs <- err
	}()

	// Wait for the command to actually be in flight before cancelling it.
	if !eventually(t, func() bool { return runner.Cancel("op-cancel") }) {
		t.Fatal("Cancel() never found the in-flight operation")
	}

	select {
	case err := <-errs:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("Run() error = %v, want it to wrap context.Canceled", err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("cancelled command did not exit")
	}
}

func TestCancelReportsUnknownOperation(t *testing.T) {
	if New().Cancel("never-started") {
		t.Error("Cancel() = true for an unknown operation, want false")
	}
}

// The registry must not leak entries, or a later id could collide with a stale
// cancel function.
func TestFinishedOperationIsNoLongerCancellable(t *testing.T) {
	runner := fakeRunner(t, "ok")

	if _, err := runner.Run(context.Background(), []string{"playroom", "list"}, Options{OperationID: "op-done"}); err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}
	if runner.Cancel("op-done") {
		t.Error("Cancel() = true after the command finished, want false")
	}
}

func TestStdinIsForwardedToTheCommand(t *testing.T) {
	runner := fakeRunner(t, "stdin")

	result, err := runner.Run(context.Background(), []string{"playroom", "open", "demo"}, Options{Stdin: "y\n"})
	if err != nil {
		t.Fatalf("Run() error = %v, want nil", err)
	}
	if want := "answered:y"; result.Stdout != want {
		t.Errorf("Stdout = %q, want %q", result.Stdout, want)
	}
}

func TestRunRejectsArgumentsTheGUIMustNeverExecute(t *testing.T) {
	tests := []struct {
		name      string
		arguments []string
		want      string
	}{
		{name: "no command", arguments: nil, want: "no command"},
		{name: "playhouse interface", arguments: []string{"playhouse", "interface"}, want: "second GUI"},
		{name: "playhouse interface via alias", arguments: []string{"ph", "interface"}, want: "second GUI"},
		{name: "playhouse interface with flags", arguments: []string{"house", "interface", "--dev"}, want: "second GUI"},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			// No fake script: the guard must reject before anything is executed.
			runner := New(WithExecutable("/nonexistent/acloud"))
			_, err := runner.Run(context.Background(), testCase.arguments, Options{})
			if err == nil {
				t.Fatalf("Run(%q) error = nil, want a refusal", testCase.arguments)
			}
			if !strings.Contains(err.Error(), testCase.want) {
				t.Errorf("error = %q, want it to mention %q", err.Error(), testCase.want)
			}
		})
	}
}

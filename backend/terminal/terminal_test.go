package terminal

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Nothing here opens a terminal or runs acloud: the hand-off is one variable,
// swapped for a recorder, so the tests assert what would have been launched.

func useFakeAcloudOnPath(t *testing.T) {
	t.Helper()
	directory := t.TempDir()
	// Executable lookup is real, but the recorded hand-off must never run this.
	if err := os.WriteFile(filepath.Join(directory, "acloud"), []byte("#!/bin/sh\nexit 1\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", directory)
	t.Setenv("ACLOUD_BINARY", "")
}

// recordHandOff replaces the launch with a recorder for one test.
func recordHandOff(t *testing.T) *struct {
	calls    int
	emulator Emulator
	line     string
	err      error
} {
	t.Helper()
	recorder := &struct {
		calls    int
		emulator Emulator
		line     string
		err      error
	}{}
	original := handOff
	handOff = func(emulator Emulator, line string) error {
		recorder.calls++
		recorder.emulator = emulator
		recorder.line = line
		return recorder.err
	}
	t.Cleanup(func() { handOff = original })
	return recorder
}

func TestOpenHandsTheCommandToTheChosenEmulator(t *testing.T) {
	useFakeAcloudOnPath(t)
	recorder := recordHandOff(t)

	if err := Open(ITerm, []string{"playroom", "connect", "demo"}); err != nil {
		t.Fatalf("Open() = %v, want no error", err)
	}

	if recorder.calls != 1 {
		t.Fatalf("hand-off called %d times, want 1", recorder.calls)
	}
	if recorder.emulator != ITerm {
		t.Errorf("emulator = %q, want %q", recorder.emulator, ITerm)
	}
	if !strings.HasSuffix(recorder.line, "playroom connect demo") {
		t.Errorf("command line = %q, want it to end with the acloud command", recorder.line)
	}
}

// An empty argument list must never reach a terminal: `acloud` on its own does
// something, and it is not what the caller meant.
func TestOpenRefusesAnEmptyCommand(t *testing.T) {
	recorder := recordHandOff(t)

	err := Open(Default, nil)

	if err == nil {
		t.Fatal("Open() with no arguments = nil, want an error")
	}
	if recorder.calls != 0 {
		t.Errorf("hand-off was called %d times for an empty command, want 0", recorder.calls)
	}
}

// A terminal that is not installed has to surface as a real error.
func TestOpenReportsAFailedLaunch(t *testing.T) {
	useFakeAcloudOnPath(t)
	recorder := recordHandOff(t)
	recorder.err = errors.New("could not open Ghostty: does not exist")

	err := Open(Ghostty, []string{"auth", "login"})

	if err == nil {
		t.Fatal("Open() = nil, want the launch failure")
	}
	if !strings.Contains(err.Error(), "Ghostty") {
		t.Errorf("error = %q, want it to name the emulator", err)
	}
}

// An argument with a space has to survive the shell the terminal runs it in.
func TestCommandLineQuotesArgumentsTheShellWouldResplit(t *testing.T) {
	useFakeAcloudOnPath(t)
	line, err := commandLine([]string{"playroom", "open", "my room", "--editor", "vscode"})
	if err != nil {
		t.Fatalf("commandLine() = %v", err)
	}

	if !strings.Contains(line, `"my room"`) && !strings.Contains(line, `'my room'`) {
		t.Errorf("command line = %q, want the spaced argument quoted", line)
	}
	if !strings.HasPrefix(line, "acloud ") {
		t.Errorf("command line = %q, want it to invoke acloud", line)
	}
}

// The emulator is a GUI concept; acloud has never heard of iTerm.
func TestTheEmulatorChoiceNeverReachesTheCommandLine(t *testing.T) {
	useFakeAcloudOnPath(t)
	recorder := recordHandOff(t)

	for _, emulator := range []Emulator{Default, ITerm, Ghostty, TerminalApp} {
		if err := Open(emulator, []string{"playroom", "connect", "demo"}); err != nil {
			t.Fatalf("Open(%q) = %v", emulator, err)
		}
		for _, name := range []string{"iterm", "ghostty", "terminal"} {
			if strings.Contains(strings.ToLower(recorder.line), name) {
				t.Errorf("command line for %q leaked the emulator name: %q", emulator, recorder.line)
			}
		}
	}
}

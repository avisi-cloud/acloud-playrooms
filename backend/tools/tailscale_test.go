package tools

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func isolateTailscale(t *testing.T) {
	t.Helper()
	homeDirectory := t.TempDir()
	t.Setenv("HOME", homeDirectory)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(homeDirectory, ".config"))
	t.Setenv("PATH", "/usr/bin:/bin")
	originalDirectories := tailscaleDirectories
	tailscaleDirectories = nil
	t.Cleanup(func() { tailscaleDirectories = originalDirectories })
}

func fakeTailscale(t *testing.T, filename string) string {
	t.Helper()
	binaryPath := filepath.Join(t.TempDir(), filename)
	script := "#!/bin/sh\nif [ \"$1\" = version ]; then printf '1.104.2\\n'; else printf 'selected:%s\\n' \"$@\"; fi\n"
	if err := os.WriteFile(binaryPath, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return binaryPath
}

func TestTailscaleSearchesHomebrewWhenPathMissesIt(t *testing.T) {
	isolateTailscale(t)
	binaryPath := fakeTailscale(t, "tailscale")
	tailscaleDirectories = []string{filepath.Dir(binaryPath)}
	status := DescribeTailscaleBinary()
	if !status.Found || status.Path != binaryPath || status.Source != SourceKnownLocation || status.Version != "1.104.2" {
		t.Fatalf("unexpected status: %+v", status)
	}
	command := exec.Command("/bin/sh", "-c", "tailscale version")
	if err := ConfigureCommandEnvironment(command); err != nil {
		t.Fatal(err)
	}
	output, err := command.CombinedOutput()
	if err != nil || strings.TrimSpace(string(output)) != "1.104.2" {
		t.Fatalf("output = %q, error = %v", output, err)
	}
}

func TestSavedTailscalePathIsUsedByCommandsAndTerminals(t *testing.T) {
	isolateTailscale(t)
	binaryPath := fakeTailscale(t, "custom tail's $binary")
	originalPath := os.Getenv("PATH")
	if err := SaveTailscaleBinary(binaryPath); err != nil {
		t.Fatal(err)
	}
	status := DescribeTailscaleBinary()
	if !status.Found || status.Source != SourceConfigured || status.ConfiguredPath != binaryPath {
		t.Fatalf("unexpected status: %+v", status)
	}
	for _, terminal := range []bool{false, true} {
		line := "tailscale 'one argument'"
		if terminal {
			line = TerminalCommand(line)
		}
		command := exec.Command("/bin/sh", "-c", line)
		if !terminal {
			if err := ConfigureCommandEnvironment(command); err != nil {
				t.Fatal(err)
			}
		}
		output, err := command.CombinedOutput()
		if err != nil || string(output) != "selected:one argument\n" {
			t.Fatalf("terminal=%v: output=%q error=%v", terminal, output, err)
		}
	}
	if os.Getenv("PATH") != originalPath {
		t.Fatal("changed the parent process PATH")
	}
}

func TestSavedTailscaleDoesNotFallBackWhenItMoves(t *testing.T) {
	isolateTailscale(t)
	binaryPath := fakeTailscale(t, "chosen")
	if err := SaveTailscaleBinary(binaryPath); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(binaryPath); err != nil {
		t.Fatal(err)
	}
	otherBinary := fakeTailscale(t, "tailscale")
	t.Setenv("PATH", filepath.Dir(otherBinary)+":/usr/bin:/bin")
	status := DescribeTailscaleBinary()
	if status.Found || status.ConfiguredPath != binaryPath || status.Source != SourceConfigured {
		t.Fatalf("silently replaced saved path: %+v", status)
	}
	command := exec.Command("/bin/sh", "-c", "tailscale version")
	if err := ConfigureCommandEnvironment(command); err != nil {
		t.Fatal(err)
	}
	if output, err := command.CombinedOutput(); err == nil {
		t.Fatalf("fell back to another tailscale: %s", output)
	}
}

func TestTailscalePreferenceCanBeClearedAndChanged(t *testing.T) {
	isolateTailscale(t)
	firstBinary := fakeTailscale(t, "first")
	secondBinary := fakeTailscale(t, "second")
	for _, binaryPath := range []string{firstBinary, secondBinary} {
		if err := SaveTailscaleBinary(binaryPath); err != nil {
			t.Fatal(err)
		}
		if status := DescribeTailscaleBinary(); status.Path != binaryPath {
			t.Fatalf("path = %q, want %q", status.Path, binaryPath)
		}
	}
	if err := ClearTailscaleBinary(); err != nil {
		t.Fatal(err)
	}
	if err := ClearTailscaleBinary(); err != nil {
		t.Fatal(err)
	}
	status := DescribeTailscaleBinary()
	if status.ConfiguredPath != "" || status.Found {
		t.Fatalf("unexpected automatic status: %+v", status)
	}
	if TerminalCommand("acloud version") != "acloud version" {
		t.Fatal("kept the saved launcher after clearing")
	}
}

func TestTailscaleRejectsInvalidPathsWithoutReplacingThePreference(t *testing.T) {
	isolateTailscale(t)
	workingBinary := fakeTailscale(t, "working")
	if err := SaveTailscaleBinary(workingBinary); err != nil {
		t.Fatal(err)
	}
	notExecutable := filepath.Join(t.TempDir(), "not-executable")
	if err := os.WriteFile(notExecutable, []byte("not a command"), 0o600); err != nil {
		t.Fatal(err)
	}
	wrongBinary := filepath.Join(t.TempDir(), "wrong-command")
	if err := os.WriteFile(wrongBinary, []byte("#!/bin/sh\nprintf 'hello\\n'\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, invalidPath := range []string{"", "/missing/tailscale", t.TempDir(), notExecutable, wrongBinary, "bad\npath"} {
		if err := SaveTailscaleBinary(invalidPath); err == nil {
			t.Errorf("accepted invalid path %q", invalidPath)
		}
		if DescribeTailscaleBinary().ConfiguredPath != workingBinary {
			t.Fatal("replaced the previous working path")
		}
	}
}

func TestMissingTailscaleLauncherIsReportedInsteadOfUsingAnotherBinary(t *testing.T) {
	isolateTailscale(t)
	if err := SaveTailscaleBinary(fakeTailscale(t, "chosen")); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(tailscaleLauncherDirectory(), "tailscale")); err != nil {
		t.Fatal(err)
	}
	if status := DescribeTailscaleBinary(); status.Found || !strings.Contains(status.Message, "save the Tailscale path again") {
		t.Fatalf("status = %+v", status)
	}
	if err := ConfigureCommandEnvironment(exec.Command("/bin/true")); err == nil {
		t.Fatal("accepted a missing launcher")
	}
}

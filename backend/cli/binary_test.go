package cli

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// fakeAcloud writes an executable script that answers `version` the way acloud
// does, so VerifyBinary exercises the real exec path.
func fakeAcloud(t *testing.T, directory, version string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake binary is a shell script")
	}
	path := filepath.Join(directory, "acloud")
	script := "#!/bin/sh\necho 'Version information'\necho 'Version: " + version + ", Commit: abc'\n"
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake acloud: %v", err)
	}
	return path
}

// isolateBinaryStore cuts a test off from this machine: the saved-path file and
// the searched home directories move under a temporary HOME, and the absolute
// install directories are emptied so a real /opt/homebrew/bin/acloud cannot
// answer for a fake one.
func isolateBinaryStore(t *testing.T) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv(acloudBinaryEnv, "")

	original := systemBinaryDirectories
	systemBinaryDirectories = nil
	t.Cleanup(func() { systemBinaryDirectories = original })
}

func TestVerifyBinary(t *testing.T) {
	directory := t.TempDir()
	good := fakeAcloud(t, directory, "0.35.0")

	version, err := VerifyBinary(good)
	if err != nil {
		t.Fatalf("VerifyBinary(%q) = %v, want no error", good, err)
	}
	if version != "0.35.0" {
		t.Fatalf("version = %q, want 0.35.0", version)
	}

	for _, test := range []struct {
		name, path, wantMessage string
	}{
		{"a missing file", filepath.Join(directory, "absent"), "no file at"},
		{"a directory", directory, "is a folder"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := VerifyBinary(test.path); err == nil ||
				!strings.Contains(err.Error(), test.wantMessage) {
				t.Fatalf("VerifyBinary(%q) = %v, want an error containing %q", test.path, err, test.wantMessage)
			}
		})
	}

	t.Run("a file that is not executable", func(t *testing.T) {
		path := filepath.Join(directory, "not-executable")
		if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
		if _, err := VerifyBinary(path); err == nil || !strings.Contains(err.Error(), "not executable") {
			t.Fatalf("VerifyBinary(%q) = %v, want a 'not executable' error", path, err)
		}
	})

	t.Run("an executable that is not acloud", func(t *testing.T) {
		path := filepath.Join(directory, "impostor")
		if err := os.WriteFile(path, []byte("#!/bin/sh\necho hello\n"), 0o755); err != nil {
			t.Fatalf("write: %v", err)
		}
		if _, err := VerifyBinary(path); err == nil || !strings.Contains(err.Error(), "does not look like acloud") {
			t.Fatalf("VerifyBinary(%q) = %v, want a 'does not look like acloud' error", path, err)
		}
	})
}

// The environment variable has to keep winning: `make dev-local` relies on it
// to run a locally built acloud even when one is installed.
func TestResolveBinaryPrefersTheEnvironmentVariable(t *testing.T) {
	isolateBinaryStore(t)
	directory := t.TempDir()
	fromEnvironment := fakeAcloud(t, directory, "0.1.0")
	configured := fakeAcloud(t, t.TempDir(), "0.2.0")
	if err := SaveConfiguredBinary(configured); err != nil {
		t.Fatalf("SaveConfiguredBinary: %v", err)
	}
	t.Setenv(acloudBinaryEnv, fromEnvironment)

	path, source, err := resolveBinary()
	if err != nil {
		t.Fatalf("resolveBinary: %v", err)
	}
	if path != fromEnvironment || source != BinarySourceEnvironment {
		t.Fatalf("resolveBinary = (%q, %q), want (%q, %q)", path, source, fromEnvironment, BinarySourceEnvironment)
	}
}

func TestSaveAndClearConfiguredBinary(t *testing.T) {
	isolateBinaryStore(t)
	configured := fakeAcloud(t, t.TempDir(), "0.35.0")

	if err := SaveConfiguredBinary(configured); err != nil {
		t.Fatalf("SaveConfiguredBinary: %v", err)
	}
	if got := ConfiguredBinary(); got != configured {
		t.Fatalf("ConfiguredBinary = %q, want %q", got, configured)
	}

	status := DescribeBinary()
	if !status.Found || status.Source != BinarySourceConfigured || status.Version != "0.35.0" {
		t.Fatalf("DescribeBinary = %+v, want a found, configured 0.35.0", status)
	}

	if err := ClearConfiguredBinary(); err != nil {
		t.Fatalf("ClearConfiguredBinary: %v", err)
	}
	if got := ConfiguredBinary(); got != "" {
		t.Fatalf("ConfiguredBinary after clearing = %q, want empty", got)
	}
	// Clearing twice is how a user who never saved one leaves the screen.
	if err := ClearConfiguredBinary(); err != nil {
		t.Fatalf("second ClearConfiguredBinary: %v", err)
	}
}

// Saving a path that cannot run would put the app back in the state this
// setting exists to escape, so it is refused.
func TestSaveConfiguredBinaryRejectsAnUnusablePath(t *testing.T) {
	isolateBinaryStore(t)
	absent := filepath.Join(t.TempDir(), "acloud")

	if err := SaveConfiguredBinary(absent); err == nil {
		t.Fatal("SaveConfiguredBinary accepted a path with no file")
	}
	if got := ConfiguredBinary(); got != "" {
		t.Fatalf("ConfiguredBinary = %q, want nothing saved", got)
	}
}

func TestSaveConfiguredBinaryExpandsHome(t *testing.T) {
	isolateBinaryStore(t)
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}
	expected := fakeAcloud(t, home, "0.35.0")

	if err := SaveConfiguredBinary("~/acloud"); err != nil {
		t.Fatalf("SaveConfiguredBinary(~/acloud): %v", err)
	}
	if got := ConfiguredBinary(); got != expected {
		t.Fatalf("ConfiguredBinary = %q, want the expanded %q", got, expected)
	}
}

// The reason this file exists: a Finder-launched app gets a PATH without any
// Homebrew prefix, so PATH alone finds nothing and the known locations must.
func TestResolveBinaryFallsBackToKnownLocations(t *testing.T) {
	isolateBinaryStore(t)
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}
	localBin := filepath.Join(home, ".local", "bin")
	if err := os.MkdirAll(localBin, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	expected := fakeAcloud(t, localBin, "0.35.0")
	t.Setenv("PATH", t.TempDir()) // a PATH that cannot possibly have acloud

	path, source, err := resolveBinary()
	if err != nil {
		t.Fatalf("resolveBinary: %v", err)
	}
	if path != expected || source != BinarySourceKnownLocation {
		t.Fatalf("resolveBinary = (%q, %q), want (%q, %q)", path, source, expected, BinarySourceKnownLocation)
	}
}

func TestResolveBinaryReportsNothingFound(t *testing.T) {
	isolateBinaryStore(t)
	t.Setenv("PATH", t.TempDir())

	if _, _, err := resolveBinary(); err == nil {
		t.Fatal("resolveBinary found acloud with nothing installed")
	}

	status := DescribeBinary()
	if status.Found || status.Source != BinarySourceNone {
		t.Fatalf("DescribeBinary = %+v, want nothing found", status)
	}
	if !strings.Contains(status.Message, "Settings") {
		t.Fatalf("Message = %q, want it to point at Settings", status.Message)
	}
}

// A saved path that stops working must surface as a correctable problem, with
// the path still visible, rather than as an empty field.
func TestDescribeBinaryKeepsABrokenConfiguredPathVisible(t *testing.T) {
	isolateBinaryStore(t)
	directory := t.TempDir()
	configured := fakeAcloud(t, directory, "0.35.0")
	if err := SaveConfiguredBinary(configured); err != nil {
		t.Fatalf("SaveConfiguredBinary: %v", err)
	}
	if err := os.Remove(configured); err != nil {
		t.Fatalf("remove: %v", err)
	}

	status := DescribeBinary()
	if status.Found {
		t.Fatalf("DescribeBinary = %+v, want not found", status)
	}
	if status.ConfiguredPath != configured {
		t.Fatalf("ConfiguredPath = %q, want %q", status.ConfiguredPath, configured)
	}
	if !strings.Contains(status.Message, "no file at") {
		t.Fatalf("Message = %q, want it to name the missing file", status.Message)
	}
}

func TestDescribeBinaryFlagsTheEnvironmentOverride(t *testing.T) {
	isolateBinaryStore(t)
	fromEnvironment := fakeAcloud(t, t.TempDir(), "0.35.0")
	t.Setenv(acloudBinaryEnv, fromEnvironment)

	status := DescribeBinary()
	if !status.EnvironmentOverride {
		t.Fatalf("DescribeBinary = %+v, want EnvironmentOverride", status)
	}
	if status.Source != BinarySourceEnvironment {
		t.Fatalf("Source = %q, want %q", status.Source, BinarySourceEnvironment)
	}
}

// A newly saved path has to apply to the next command, not the next launch:
// otherwise the user fixes the setting and the app still shows nothing.
func TestSavingABinaryInvalidatesTheCachedPath(t *testing.T) {
	isolateBinaryStore(t)
	t.Setenv("PATH", t.TempDir())
	defaultRunner.forgetResolvedBinary()
	t.Cleanup(defaultRunner.forgetResolvedBinary)

	if _, err := defaultRunner.pathToOwnExecutable(); err == nil {
		t.Fatal("pathToOwnExecutable found acloud with nothing installed")
	}

	configured := fakeAcloud(t, t.TempDir(), "0.35.0")
	if err := SaveConfiguredBinary(configured); err != nil {
		t.Fatalf("SaveConfiguredBinary: %v", err)
	}

	path, err := defaultRunner.pathToOwnExecutable()
	if err != nil {
		t.Fatalf("pathToOwnExecutable after saving: %v", err)
	}
	if path != configured {
		t.Fatalf("pathToOwnExecutable = %q, want the newly saved %q", path, configured)
	}
}

func TestParseVersionLine(t *testing.T) {
	for _, test := range []struct {
		name, output, expected string
	}{
		{"acloud's own output", "Version information\nVersion: 0.35.0, Commit: abc\n", "0.35.0"},
		{"a v prefix", "Version: v1.2.3\n", "1.2.3"},
		{"a pre-release", "Version: 1.2.0-rc1\n", "1.2.0-rc1"},
		{"no version at all", "hello\n", ""},
		{"nothing", "", ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			if actual := parseVersionLine(test.output); actual != test.expected {
				t.Fatalf("parseVersionLine(%q) = %q, want %q", test.output, actual, test.expected)
			}
		})
	}
}

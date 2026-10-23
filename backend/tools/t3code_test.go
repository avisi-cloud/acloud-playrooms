package tools

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func isolateT3Code(t *testing.T) {
	t.Helper()
	homeDirectory := t.TempDir()
	t.Setenv("HOME", homeDirectory)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(homeDirectory, ".config"))
	t.Setenv("PATH", "/usr/bin:/bin")
	originalApplications, originalDirectories := t3CodeApplications, t3CodeCommandDirectories
	t3CodeApplications, t3CodeCommandDirectories = nil, nil
	t.Cleanup(func() { t3CodeApplications, t3CodeCommandDirectories = originalApplications, originalDirectories })
}

func fakeT3CodeCommand(t *testing.T, name, version string) string {
	t.Helper()
	command := filepath.Join(t.TempDir(), name)
	script := "#!/bin/sh\n[ \"$1\" = --version ] || exit 1\nprintf '%s\\n' " + quoteShellArgument(version) + "\n"
	if err := os.WriteFile(command, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return command
}

func fakeT3CodeApplication(t *testing.T, identifier string) string {
	t.Helper()
	application := filepath.Join(t.TempDir(), "T3 Code (Beta).app")
	if err := os.MkdirAll(filepath.Join(application, "Contents", "MacOS"), 0o700); err != nil {
		t.Fatal(err)
	}
	metadata := fmt.Sprintf(`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>%s</string><key>CFBundleExecutable</key><string>T3 Code</string><key>CFBundleShortVersionString</key><string>0.1.2</string></dict></plist>`, identifier)
	if err := os.WriteFile(filepath.Join(application, "Contents", "Info.plist"), []byte(metadata), 0o600); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\ntouch " + quoteShellArgument(filepath.Join(application, "was-launched")) + "\n"
	if err := os.WriteFile(filepath.Join(application, "Contents", "MacOS", "T3 Code"), []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return application
}

func TestT3CodeFindsACommandOutsidePath(t *testing.T) {
	isolateT3Code(t)
	command := fakeT3CodeCommand(t, "t3", "0.1.2")
	t3CodeCommandDirectories = []string{filepath.Dir(command)}
	status := DescribeT3CodePath()
	if !status.Found || status.Path != command || status.Version != "0.1.2" || status.Source != SourceKnownLocation || status.IsApplication {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestT3CodePathCanBeSavedChangedAndCleared(t *testing.T) {
	isolateT3Code(t)
	first := fakeT3CodeCommand(t, "custom t3's command", "0.1.2")
	second := fakeT3CodeCommand(t, "other", "t3 v0.1.3-beta.1")
	originalPath := os.Getenv("PATH")
	for _, command := range []string{first, second} {
		if err := SaveT3CodePath(command); err != nil {
			t.Fatal(err)
		}
		status := DescribeT3CodePath()
		if !status.Found || status.Path != command || status.ConfiguredPath != command || status.Source != SourceConfigured {
			t.Fatalf("unexpected saved status: %+v", status)
		}
	}
	if os.Getenv("PATH") != originalPath {
		t.Fatal("a future-only setting changed PATH")
	}
	if err := ClearT3CodePath(); err != nil {
		t.Fatal(err)
	}
	if status := DescribeT3CodePath(); status.Found || status.ConfiguredPath != "" {
		t.Fatalf("did not clear the preference: %+v", status)
	}
}

func TestT3CodeKeepsABrokenSavedPathInsteadOfFindingAnotherInstallation(t *testing.T) {
	isolateT3Code(t)
	command := fakeT3CodeCommand(t, "chosen", "0.1.2")
	if err := SaveT3CodePath(command); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(command); err != nil {
		t.Fatal(err)
	}
	other := fakeT3CodeCommand(t, "t3", "0.1.3")
	t3CodeCommandDirectories = []string{filepath.Dir(other)}
	if status := DescribeT3CodePath(); status.Found || status.Path != command || status.Source != SourceConfigured {
		t.Fatalf("silently replaced the saved path: %+v", status)
	}
}

func TestT3CodeRejectsInvalidPathsBeforeReplacingAPreference(t *testing.T) {
	isolateT3Code(t)
	working := fakeT3CodeCommand(t, "t3", "0.1.2")
	if err := SaveT3CodePath(working); err != nil {
		t.Fatal(err)
	}
	wrongCommand := fakeT3CodeCommand(t, "wrong", "not a version")
	for _, invalid := range []string{"", "/missing/t3", t.TempDir(), wrongCommand, "bad\npath"} {
		if err := SaveT3CodePath(invalid); err == nil {
			t.Errorf("accepted %q", invalid)
		}
		if DescribeT3CodePath().ConfiguredPath != working {
			t.Fatal("replaced the working preference")
		}
	}
}

func TestT3CodeChecksDesktopMetadataWithoutLaunchingTheApp(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS application metadata uses PlistBuddy")
	}
	isolateT3Code(t)
	application := fakeT3CodeApplication(t, "com.t3tools.t3code")
	t3CodeApplications = []string{application}
	status := DescribeT3CodePath()
	if !status.Found || !status.IsApplication || status.Path != application || status.Version != "0.1.2" {
		t.Fatalf("unexpected app status: %+v", status)
	}
	if err := SaveT3CodePath(application); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(application, "was-launched")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("launched the desktop app during validation")
	}
	wrongApp := fakeT3CodeApplication(t, "com.example.not-t3-code")
	if err := SaveT3CodePath(wrongApp); err == nil || !strings.Contains(err.Error(), "not T3 Code") {
		t.Fatalf("accepted another application: %v", err)
	}
	if err := SaveT3CodePath(filepath.Join(application, "Contents", "MacOS", "T3 Code")); err == nil {
		t.Fatal("accepted the desktop executable instead of the app bundle")
	}
}

//go:build gui

package gui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveSettingsFileWritesPrivateFileAndSkipsCancel(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	content := `{"format":"acloud-playrooms-settings","version":1}`
	if err := saveSettingsFile(path, content); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("mode = %v, error = %v", info, err)
	}
	if err := saveSettingsFile("", content); err != nil {
		t.Fatalf("cancel: %v", err)
	}
}

func TestReadSettingsFileRoundTripsWhatWasSaved(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	content := `{"format":"acloud-playrooms-settings","version":1}`
	if err := saveSettingsFile(path, content); err != nil {
		t.Fatal(err)
	}
	got, err := readSettingsFile(path)
	if err != nil || got != content {
		t.Fatalf("read = %q, error = %v", got, err)
	}
}

func TestReadSettingsFileRefusesFilesOverOneMegabyte(t *testing.T) {
	path := filepath.Join(t.TempDir(), "large.json")
	if err := os.WriteFile(path, []byte(strings.Repeat("x", maximumSettingsFileBytes+1)), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := readSettingsFile(path); err == nil || !strings.Contains(err.Error(), "larger than 1 MB") {
		t.Fatalf("error = %v", err)
	}
}

func TestReadSettingsFileReportsMissingFile(t *testing.T) {
	if _, err := readSettingsFile(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Fatal("expected an error")
	}
}

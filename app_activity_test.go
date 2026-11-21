//go:build gui

package gui

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveActivityLog(t *testing.T) {
	path := filepath.Join(t.TempDir(), "activity.txt")
	content := "$ acloud demo --token [redacted]\nFailed\n"
	if err := saveActivityLog(path, content); err != nil {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(path)
	if err != nil || string(actual) != content {
		t.Fatalf("saved = %q, error = %v", actual, err)
	}
	if err := saveActivityLog("", content); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if err := saveActivityLog(filepath.Join(path, "missing", "activity.txt"), content); err == nil {
		t.Fatal("expected write failure")
	}
}

package local

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fakeEnvironmentShell(t *testing.T, script string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "shell")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestEnvironmentPresence(t *testing.T) {
	t.Setenv("DEMO_API_KEY", "private-value")
	t.Setenv("EMPTY_DEMO", "")
	t.Setenv("MISSING_DEMO", "")
	os.Unsetenv("MISSING_DEMO")
	environment, err := ResolveEnvironment(context.Background(), []string{"DEMO_API_KEY", "EMPTY_DEMO", "MISSING_DEMO", "INLINE=value", ""}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(environment.Presence) != 3 || !environment.Presence[0].Set || !environment.Presence[1].Set || environment.Presence[2].Set {
		t.Fatalf("unexpected presence: %+v", environment.Presence)
	}
	encoded, _ := json.Marshal(environment.Presence)
	if strings.Contains(string(encoded), "private-value") {
		t.Fatal("presence exposed a value")
	}
}

func TestLoginShellEnvironment(t *testing.T) {
	shell := fakeEnvironmentShell(t, `test "$1" = '-l' && test "$2" = '-c' && test "$3" = 'env -0' || exit 2
printf 'DEMO_API_KEY=shell value\nwith newline\000EMPTY_DEMO=\000UNREQUESTED=private\000'
`)
	t.Setenv("DEMO_API_KEY", "app-value")
	environment, err := resolveEnvironment(context.Background(), []string{"DEMO_API_KEY", "EMPTY_DEMO", "MISSING_DEMO"}, true, shell, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if len(environment.ChildEnvironment()) != 2 || environment.ChildEnvironment()[0] != "DEMO_API_KEY=shell value\nwith newline" {
		t.Fatalf("wrong child environment")
	}
	if environment.Presence[2].Set {
		t.Fatal("missing variable is set")
	}
}

func TestLoginShellFailureAndTimeoutNeverExposeOutput(t *testing.T) {
	for _, script := range []string{"printf 'private-value'; printf 'private-value' >&2; exit 1", "printf 'private-value'; exec sleep 5"} {
		t.Run(script, func(t *testing.T) {
			var logs bytes.Buffer
			original := log.Writer()
			log.SetOutput(&logs)
			defer log.SetOutput(original)
			started := time.Now()
			_, err := resolveEnvironment(context.Background(), []string{"DEMO_API_KEY"}, true, fakeEnvironmentShell(t, script), 30*time.Millisecond)
			if err == nil || strings.Contains(err.Error(), "private-value") {
				t.Fatalf("unsafe error: %v", err)
			}
			if logs.Len() == 0 || strings.Contains(logs.String(), "private-value") {
				t.Fatal("unsafe or missing failure log")
			}
			if time.Since(started) > time.Second {
				t.Fatal("shell did not time out")
			}
		})
	}
}

func TestEnvironmentRefusesInvalidKeyAndUnavailableShell(t *testing.T) {
	for _, key := range []string{"not a key", "GOOD_KEY"} {
		if _, err := resolveEnvironment(context.Background(), []string{key}, true, "", time.Second); err == nil {
			t.Fatal("expected refusal")
		}
	}
}

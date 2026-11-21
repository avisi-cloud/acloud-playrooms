package playroom

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreateRequiresConfirmationForEachMissingEnvironmentKey(t *testing.T) {
	t.Setenv("MISSING_DEMO", "")
	os.Unsetenv("MISSING_DEMO")
	err := Create(context.Background(), "", CreateInput{EnvVars: []string{"MISSING_DEMO"}, MissingEnvironmentConfirmed: []string{"OTHER_KEY"}})
	if err == nil || err.Error() != "MISSING_DEMO is not set. Create without it?" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEnvironmentOptionsNeverBecomeArguments(t *testing.T) {
	arguments := strings.Join(buildCreateArguments(CreateInput{Name: "demo", EnvVars: []string{"DEMO_API_KEY"}, ReadVariablesFromLoginShell: true, MissingEnvironmentConfirmed: []string{"DEMO_API_KEY"}}), " ")
	if !strings.Contains(arguments, "--env DEMO_API_KEY") || strings.Contains(arguments, "shell") || strings.Contains(arguments, "confirmed") {
		t.Fatal(arguments)
	}
}

func TestCreateUsesOnlyRequestedShellValuesAndHonorsMissingConfirmation(t *testing.T) {
	directory := t.TempDir()
	t.Setenv("HOME", directory)
	t.Setenv("XDG_CONFIG_HOME", directory)
	t.Setenv("DEMO_API_KEY", "app-private")
	binary := filepath.Join(directory, "acloud-fake")
	script := `#!/bin/sh
if [ "$EXPECT_PRESENT" = yes ]; then
 test "$DEMO_API_KEY" = shell-private || exit 2
else
 test "${DEMO_API_KEY+x}" != x || exit 3
fi
test "${UNREQUESTED_DEMO+x}" != x || exit 4
for argument in "$@"; do
 case "$argument" in *shell-private*|*app-private*) exit 5;; esac
done
`
	if err := os.WriteFile(binary, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ACLOUD_BINARY", binary)
	shell := filepath.Join(directory, "shell-fake")
	t.Setenv("SHELL", shell)
	input := CreateInput{Name: "demo", EnvVars: []string{"DEMO_API_KEY"}, ReadVariablesFromLoginShell: true}
	if err := os.WriteFile(shell, []byte("#!/bin/sh\nprintf 'DEMO_API_KEY=shell-private\\000UNREQUESTED_DEMO=private\\000'\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("EXPECT_PRESENT", "yes")
	if err := Create(context.Background(), "", input); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(shell, []byte("#!/bin/sh\nprintf 'UNREQUESTED_DEMO=private\\000'\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := Create(context.Background(), "", input); err == nil || !strings.Contains(err.Error(), "DEMO_API_KEY is not set") {
		t.Fatalf("missing key was not refused: %v", err)
	}
	input.MissingEnvironmentConfirmed = []string{"DEMO_API_KEY"}
	t.Setenv("EXPECT_PRESENT", "no")
	if err := Create(context.Background(), "", input); err != nil {
		t.Fatal(err)
	}
	if os.Getenv("DEMO_API_KEY") != "app-private" {
		t.Fatal("parent environment changed")
	}
}

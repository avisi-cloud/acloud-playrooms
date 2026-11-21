package local

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
	"github.com/avisi-cloud/acloud-playrooms/backend/terminal"
	"github.com/avisi-cloud/acloud-playrooms/backend/tools"
)

func writeFakeCommand(t *testing.T, name, script string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script+"\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

func makeApplication(t *testing.T, directory, bundle string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(directory, bundle), 0o700); err != nil {
		t.Fatal(err)
	}
}

func TestCheckAcloudReportsMissingOldNewerAndSupportedVersions(t *testing.T) {
	cases := []struct {
		name    string
		binary  cli.BinaryStatus
		status  HealthStatus
		command string
	}{
		{"missing", cli.BinaryStatus{Message: "cannot find the acloud command"}, HealthFailed, "brew install --cask avisi-cloud/tools/acloud"},
		{"too old", cli.BinaryStatus{Found: true, Version: "0.30.0", Path: "/bin/acloud"}, HealthFailed, "brew upgrade --cask acloud"},
		{"newer than verified", cli.BinaryStatus{Found: true, Version: "99.0.0", Path: "/bin/acloud"}, HealthWarning, ""},
		{"supported", cli.BinaryStatus{Found: true, Version: MinimumAcloudVersion, Path: "/bin/acloud"}, HealthPassed, ""},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			check := checkAcloud(testCase.binary)
			if check.Key != HealthCheckAcloud || check.Status != testCase.status || check.Command != testCase.command {
				t.Fatalf("check = %+v", check)
			}
			if wantsSettings := !testCase.binary.Found; wantsSettings != (check.Action == HealthActionOpenSettings) {
				t.Fatalf("action = %q", check.Action)
			}
			if check.Explanation == "" {
				t.Fatal("missing explanation")
			}
		})
	}
}

func TestCheckSignInReadsTheStoredCredentials(t *testing.T) {
	t.Setenv("ACLOUDCONFIG", writeTestConfigFile(t, ""))
	if check := checkSignIn(); check.Status != HealthFailed || check.Command != "acloud auth login" || check.Action != HealthActionSignIn {
		t.Fatalf("signed out check = %+v", check)
	}
	t.Setenv("ACLOUDCONFIG", writeTestConfigFile(t, "secret-token"))
	check := checkSignIn()
	if check.Status != HealthPassed || check.Explanation != "Signed in as demo-user." {
		t.Fatalf("signed in check = %+v", check)
	}
	if strings.Contains(check.Explanation, "secret-token") {
		t.Fatal("explanation leaked the token")
	}
}

func TestCheckSSHKeyFindsOnlyPublicDefaultKeys(t *testing.T) {
	home := t.TempDir()
	sshDirectory := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(sshDirectory, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"id_ed25519", "other.pub"} {
		if err := os.WriteFile(filepath.Join(sshDirectory, name), []byte("key"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if check := checkSSHKey(home); check.Status != HealthFailed || check.Command != "ssh-keygen -t ed25519" {
		t.Fatalf("without a public key = %+v", check)
	}
	if err := os.WriteFile(filepath.Join(sshDirectory, "id_ed25519.pub"), []byte("ssh-ed25519 AAAA"), 0o600); err != nil {
		t.Fatal(err)
	}
	if check := checkSSHKey(home); check.Status != HealthPassed || check.Explanation != "Found ~/.ssh/id_ed25519.pub." {
		t.Fatalf("with a public key = %+v", check)
	}
	if check := checkSSHKey(""); check.Status != HealthUnknown {
		t.Fatalf("without a home folder = %+v", check)
	}
}

func TestCheckTailscaleReadsTheBackendState(t *testing.T) {
	cases := []struct {
		name    string
		script  string
		status  HealthStatus
		command string
	}{
		{"logged in", `echo '{"BackendState":"Running"}'`, HealthPassed, ""},
		{"logged out", `echo '{"BackendState":"NeedsLogin"}'; exit 1`, HealthFailed, "tailscale up"},
		{"turned off", `echo '{"BackendState":"Stopped"}'; exit 1`, HealthFailed, "tailscale up"},
		{"unreadable", `echo 'not json'`, HealthUnknown, ""},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			path := writeFakeCommand(t, "tailscale", `[ "$1 $2" = "status --json" ] || exit 9`+"\n"+testCase.script)
			check := checkTailscale(context.Background(), tools.TailscaleBinaryStatus{Found: true, Path: path, Version: "1.80.0"})
			if check.Status != testCase.status || check.Command != testCase.command {
				t.Fatalf("check = %+v", check)
			}
		})
	}
}

func TestCheckTailscaleReportsAMissingBinaryWithoutRunningIt(t *testing.T) {
	check := checkTailscale(context.Background(), tools.TailscaleBinaryStatus{Message: "Cannot find the Tailscale command."})
	if check.Status != HealthFailed || check.Explanation != "Cannot find the Tailscale command." || check.Action != HealthActionOpenSettings {
		t.Fatalf("check = %+v", check)
	}
}

func TestCheckTailscaleStopsAtItsTimeout(t *testing.T) {
	path := writeFakeCommand(t, "tailscale", "exec sleep 30")
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	started := time.Now()
	check := checkTailscale(ctx, tools.TailscaleBinaryStatus{Found: true, Path: path})
	if check.Status != HealthUnknown {
		t.Fatalf("check = %+v", check)
	}
	if elapsed := time.Since(started); elapsed > 10*time.Second {
		t.Fatalf("waited %s for a hanging tailscale", elapsed)
	}
}

func TestCheckTerminalLooksForTheChosenApplication(t *testing.T) {
	directory := t.TempDir()
	makeApplication(t, directory, "Terminal.app")
	if check := checkTerminal(terminal.TerminalApp, []string{directory}); check.Status != HealthPassed {
		t.Fatalf("Terminal = %+v", check)
	}
	if check := checkTerminal(terminal.Default, []string{directory}); check.Status != HealthPassed {
		t.Fatalf("default terminal = %+v", check)
	}
	if check := checkTerminal(terminal.ITerm, []string{directory}); check.Status != HealthFailed || !strings.Contains(check.Explanation, "iTerm2") {
		t.Fatalf("missing iTerm = %+v", check)
	}
	makeApplication(t, directory, "Ghostty.app")
	if check := checkTerminal(terminal.Ghostty, []string{directory}); check.Status != HealthPassed {
		t.Fatalf("Ghostty = %+v", check)
	}
	if check := checkTerminal("kitty", []string{directory}); check.Status != HealthUnknown {
		t.Fatalf("unknown terminal = %+v", check)
	}
}

func TestCheckEditorFindsTheVSCodeRemoteSSHExtension(t *testing.T) {
	withExtension := writeFakeCommand(t, "code", `[ "$1" = "--list-extensions" ] || exit 9`+"\necho golang.go\necho MS-vscode-remote.remote-ssh")
	if check := checkEditor(context.Background(), EditorVSCode, withExtension, nil); check.Status != HealthPassed {
		t.Fatalf("with extension = %+v", check)
	}
	withoutExtension := writeFakeCommand(t, "code", "echo golang.go")
	check := checkEditor(context.Background(), EditorVSCode, withoutExtension, nil)
	if check.Status != HealthFailed || check.Command != "code --install-extension ms-vscode-remote.remote-ssh" {
		t.Fatalf("without extension = %+v", check)
	}
	broken := writeFakeCommand(t, "code", "exit 3")
	if check := checkEditor(context.Background(), EditorVSCode, broken, nil); check.Status != HealthUnknown {
		t.Fatalf("broken code = %+v", check)
	}
	if check := checkEditor(context.Background(), EditorVSCode, "", nil); check.Status != HealthFailed {
		t.Fatalf("missing VS Code = %+v", check)
	}
}

func TestCheckEditorLooksForAJetBrainsLinkHandler(t *testing.T) {
	directory := t.TempDir()
	if check := checkEditor(context.Background(), EditorIntelliJ, "", []string{directory}); check.Status != HealthWarning {
		t.Fatalf("without Gateway = %+v", check)
	}
	makeApplication(t, directory, "JetBrains Toolbox.app")
	if check := checkEditor(context.Background(), EditorWebStorm, "", []string{directory}); check.Status != HealthPassed || !strings.Contains(check.Explanation, "WebStorm") {
		t.Fatalf("with Toolbox = %+v", check)
	}
	if check := checkEditor(context.Background(), "emacs", "", []string{directory}); check.Status != HealthUnknown {
		t.Fatalf("unknown editor = %+v", check)
	}
}

func TestCheckHealthReturnsEveryCheckInScreenOrder(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("PATH", "/usr/bin:/bin")
	t.Setenv("ACLOUDCONFIG", writeTestConfigFile(t, ""))
	t.Setenv("ACLOUD_BINARY", writeFakeCommand(t, "acloud", "echo 'Version: "+MinimumAcloudVersion+", Commit: abc'"))
	originalDirectories := applicationDirectories
	applicationDirectories = nil
	t.Cleanup(func() { applicationDirectories = originalDirectories })

	checks := CheckHealth(context.Background(), HealthCheckInput{Terminal: terminal.ITerm, Editor: EditorIntelliJ})

	want := []HealthCheckKey{HealthCheckAcloud, HealthCheckSignIn, HealthCheckSSHKey, HealthCheckTailscale, HealthCheckTerminal, HealthCheckEditor}
	if len(checks) != len(want) {
		t.Fatalf("got %d checks", len(checks))
	}
	for index, key := range want {
		if checks[index].Key != key {
			t.Fatalf("check %d = %s, want %s", index, checks[index].Key, key)
		}
	}
	if checks[0].Status != HealthPassed || checks[1].Status != HealthFailed || checks[3].Status != HealthSkipped {
		t.Fatalf("checks = %+v", checks)
	}
}

package tools

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func isolateVSCode(t *testing.T) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("PATH", "/usr/bin:/bin")
	originalDirectories := vsCodeCommandDirectories
	vsCodeCommandDirectories = nil
	t.Cleanup(func() { vsCodeCommandDirectories = originalDirectories })
}

func fakeVSCodeCommand(t *testing.T, directory string) string {
	t.Helper()
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	commandPath := filepath.Join(directory, "code")
	if err := os.WriteFile(commandPath, []byte("#!/bin/sh\nprintf 'vscode:%s\\n' \"$@\"\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	return commandPath
}

func TestVSCodeIsFoundOutsideTheFinderPath(t *testing.T) {
	isolateVSCode(t)
	directory := filepath.Join(t.TempDir(), "Visual Studio Code.app", "Contents", "Resources", "app", "bin")
	fakeVSCodeCommand(t, directory)
	vsCodeCommandDirectories = []string{directory}
	originalPath := os.Getenv("PATH")
	command := exec.Command("/bin/sh", "-c", `code --remote 'ssh-remote+playroom@demo' '/home/playroom/workspace with spaces/'`)
	command.Env = append(os.Environ(), "KEEP_THIS=unchanged")

	ConfigureVSCodeCommandEnvironment(command)

	output, err := command.CombinedOutput()
	if err != nil || string(output) != "vscode:--remote\nvscode:ssh-remote+playroom@demo\nvscode:/home/playroom/workspace with spaces/\n" {
		t.Fatalf("output = %q, error = %v", output, err)
	}
	if !slices.Contains(command.Env, "KEEP_THIS=unchanged") {
		t.Fatal("lost an existing environment variable")
	}
	if os.Getenv("PATH") != originalPath {
		t.Fatal("changed the parent process PATH")
	}
	firstPath := slices.Clone(command.Env)
	ConfigureVSCodeCommandEnvironment(command)
	if !slices.Equal(command.Env, firstPath) {
		t.Fatal("added VS Code to PATH more than once")
	}
}

func TestVSCodeFindsAnApplicationInstalledForTheCurrentUser(t *testing.T) {
	isolateVSCode(t)
	directory := filepath.Join(os.Getenv("HOME"), "Applications", "Visual Studio Code.app", "Contents", "Resources", "app", "bin")
	fakeVSCodeCommand(t, directory)
	command := exec.Command("/bin/sh", "-c", "code --version")

	ConfigureVSCodeCommandEnvironment(command)

	if output, err := command.CombinedOutput(); err != nil || string(output) != "vscode:--version\n" {
		t.Fatalf("output = %q, error = %v", output, err)
	}
}

func TestVSCodeKeepsTheCommandAlreadyOnTheChildProcessPath(t *testing.T) {
	isolateVSCode(t)
	chosenDirectory := t.TempDir()
	fakeVSCodeCommand(t, chosenDirectory)
	otherDirectory := t.TempDir()
	fakeVSCodeCommand(t, otherDirectory)
	vsCodeCommandDirectories = []string{otherDirectory}
	command := exec.Command("/bin/sh", "-c", "code --version")
	command.Env = []string{"PATH=" + chosenDirectory + ":/usr/bin:/bin", "KEEP_THIS=unchanged"}
	originalEnvironment := slices.Clone(command.Env)

	ConfigureVSCodeCommandEnvironment(command)

	if !slices.Equal(command.Env, originalEnvironment) {
		t.Fatalf("changed the selected command environment: %v", command.Env)
	}
}

func TestVSCodeLeavesTheEnvironmentUnchangedWhenItIsNotInstalled(t *testing.T) {
	isolateVSCode(t)
	command := exec.Command("/bin/true")

	ConfigureVSCodeCommandEnvironment(command)

	if command.Env != nil {
		t.Fatal("changed the environment without finding VS Code")
	}
}

func TestVSCodeIgnoresDirectoriesAndNonExecutableCommands(t *testing.T) {
	isolateVSCode(t)
	directoryCommand := t.TempDir()
	if err := os.Mkdir(filepath.Join(directoryCommand, "code"), 0o700); err != nil {
		t.Fatal(err)
	}
	nonExecutableDirectory := t.TempDir()
	if err := os.WriteFile(filepath.Join(nonExecutableDirectory, "code"), []byte("not executable"), 0o600); err != nil {
		t.Fatal(err)
	}
	vsCodeCommandDirectories = []string{directoryCommand, nonExecutableDirectory}
	command := exec.Command("/bin/true")

	ConfigureVSCodeCommandEnvironment(command)

	if command.Env != nil {
		t.Fatal("added an unusable VS Code command to PATH")
	}
}

func TestVSCodeCanConfigureAChildWithoutAnExistingPath(t *testing.T) {
	isolateVSCode(t)
	directory := t.TempDir()
	fakeVSCodeCommand(t, directory)
	vsCodeCommandDirectories = []string{directory}
	command := exec.Command("/bin/true")
	command.Env = []string{"KEEP_THIS=unchanged"}

	ConfigureVSCodeCommandEnvironment(command)

	if !slices.Contains(command.Env, "PATH="+directory) || !slices.Contains(command.Env, "KEEP_THIS=unchanged") {
		t.Fatalf("unexpected environment: %v", command.Env)
	}
}

func TestVSCodeKeepsTheConfiguredTailscaleLauncher(t *testing.T) {
	isolateTailscale(t)
	isolateVSCode(t)
	tailscaleBinary := fakeTailscale(t, "custom-tailscale")
	if err := SaveTailscaleBinary(tailscaleBinary); err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	fakeVSCodeCommand(t, directory)
	vsCodeCommandDirectories = []string{directory}
	command := exec.Command("/bin/sh", "-c", "tailscale version && code --version")
	if err := ConfigureCommandEnvironment(command); err != nil {
		t.Fatal(err)
	}

	ConfigureVSCodeCommandEnvironment(command)

	output, err := command.CombinedOutput()
	if err != nil || strings.TrimSpace(string(output)) != "1.104.2\nvscode:--version" {
		t.Fatalf("output = %q, error = %v", output, err)
	}
}

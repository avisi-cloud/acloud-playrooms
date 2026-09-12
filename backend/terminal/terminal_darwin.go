package terminal

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// openCommandLineInTerminal runs one command line in the chosen macOS emulator.
// Never via AppleScript: that waits on a TCC consent dialog the GUI never shows.
func openCommandLineInTerminal(emulator Emulator, line string) error {
	switch emulator {
	case ITerm:
		return openViaScript("iTerm", line)
	case Ghostty:
		return openGhostty(line)
	default:
		return openViaScript("Terminal", line)
	}
}

// openViaScript writes the command to a throwaway script and opens it: both
// Terminal.app and iTerm run an executable file in a new window.
func openViaScript(app, line string) error {
	path, err := writeLaunchScript(line)
	if err != nil {
		return err
	}
	if err := startTerminalApplication(app, exec.Command("open", "-a", app, path)); err != nil {
		// The script never ran, so nothing else will clean it up.
		_ = os.Remove(path)
		return err
	}
	return nil
}

// writeLaunchScript renders the command into an executable script and returns
// its path. The script unlinks itself before exec'ing, leaving nothing in /tmp.
func writeLaunchScript(line string) (string, error) {
	file, err := os.CreateTemp("", "acloud-*.command")
	if err != nil {
		return "", fmt.Errorf("could not prepare the terminal command: %w", err)
	}
	path := file.Name()

	script := "#!/bin/sh\nrm -f \"$0\"\nexec " + line + "\n"
	if _, err := file.WriteString(script); err != nil {
		file.Close()
		_ = os.Remove(path)
		return "", fmt.Errorf("could not prepare the terminal command: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return "", fmt.Errorf("could not prepare the terminal command: %w", err)
	}
	if err := os.Chmod(path, 0o700); err != nil {
		_ = os.Remove(path)
		return "", fmt.Errorf("could not prepare the terminal command: %w", err)
	}
	// `open` needs an absolute path it can resolve on its own.
	if !filepath.IsAbs(path) {
		abs, err := filepath.Abs(path)
		if err == nil {
			path = abs
		}
	}
	return path, nil
}

// openGhostty passes the command as a launch argument rather than a script.
func openGhostty(line string) error {
	return startTerminalApplication("Ghostty", exec.Command("open", "-a", "Ghostty", "--args", "--command="+line))
}

// startTerminalApplication runs the launcher and reports a failure the user can
// act on. It waits, so an emulator that is not installed cannot pass silently.
func startTerminalApplication(name string, cmd *exec.Cmd) error {
	output, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}
	if detail := strings.TrimSpace(string(output)); detail != "" {
		return fmt.Errorf("could not open %s: %s", name, detail)
	}
	return fmt.Errorf("could not open %s: %w", name, err)
}

// Package terminal hands an acloud command to the user's terminal emulator, for
// the commands that need a real TTY. macOS only; see doc/DECISIONS.md.
package terminal

import (
	"errors"
	"os/exec"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// Emulator names a supported terminal application. Anything unrecognised falls
// back to the platform default.
type Emulator string

const (
	Default     Emulator = ""
	ITerm       Emulator = "iterm"
	Ghostty     Emulator = "ghostty"
	TerminalApp Emulator = "terminal"
)

// handOff is the launch itself, behind a variable so tests can see what would
// have been opened without opening it.
var handOff = openCommandLineInTerminal

// Open launches `acloud <arguments...>` in the chosen terminal emulator.
func Open(emulator Emulator, arguments []string) error {
	if len(arguments) == 0 {
		return errors.New("refusing to open a terminal with no command")
	}
	line, err := commandLine(arguments)
	if err != nil {
		return err
	}
	return handOff(emulator, line)
}

// commandLine renders the command the terminal will run, preferring the bare
// name "acloud" and falling back to this binary's path when it is not on PATH.
func commandLine(arguments []string) (string, error) {
	name := "acloud"
	if _, err := exec.LookPath(name); err != nil {
		resolved, execErr := cli.Executable()
		if execErr != nil {
			return "", execErr
		}
		name = resolved
	}
	return cli.Quote(append([]string{name}, arguments...)), nil
}

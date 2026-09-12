//go:build !darwin

package terminal

import (
	"fmt"
	"runtime"
)

// openCommandLineInTerminal reports that this platform has no hand-off yet, and
// prints the command line so the user can run it by hand.
func openCommandLineInTerminal(_ Emulator, line string) error {
	return fmt.Errorf("opening a terminal is not supported on %s yet; run this by hand: %s", runtime.GOOS, line)
}

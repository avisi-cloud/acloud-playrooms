package cli

import (
	"fmt"
	"strings"
)

// cobraErrorPrefix is how cobra introduces the failure on stderr, and so marks
// where the explanation starts.
const cobraErrorPrefix = "Error: "

// ExitError is returned when an acloud command exits non-zero, carrying the
// command that ran and what the CLI said about it.
type ExitError struct {
	Arguments []string
	ExitCode  int
	Stderr    string
}

// Error returns the CLI's own explanation, with any credential blanked: this
// string reaches a toast and the activity log.
func (exitError *ExitError) Error() string {
	if explanation := explanationFrom(exitError.Stderr, 3); explanation != "" {
		return RedactText(explanation, exitError.Arguments)
	}
	return fmt.Sprintf("%s exited with code %d", PreviewString(exitError.Arguments), exitError.ExitCode)
}

// explanationFrom returns everything from cobra's marker onwards, so a failure
// keeps the remedy it printed after it. Without a marker, the last keptLineCount lines.
func explanationFrom(stderr string, keptLineCount int) string {
	lines := strings.Split(stderr, "\n")

	// From the last marker on: a wrapped failure can print more than one.
	for i := len(lines) - 1; i >= 0; i-- {
		trimmed := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(trimmed, cobraErrorPrefix) {
			continue
		}
		fromMarker := append([]string{strings.TrimPrefix(trimmed, cobraErrorPrefix)}, lines[i+1:]...)
		return strings.TrimSpace(strings.Join(fromMarker, "\n"))
	}

	var kept []string
	for i := len(lines) - 1; i >= 0 && len(kept) < keptLineCount; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		kept = append([]string{line}, kept...)
	}
	return strings.Join(kept, "\n")
}
